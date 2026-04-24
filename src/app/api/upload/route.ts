import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processDocument, processINGCSV } from '@/lib/claude-processor'

export const maxDuration = 60

async function ensureBucket(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = (buckets || []).some((b: { name: string }) => b.name === 'documents')
  if (!exists) {
    await supabase.storage.createBucket('documents', { public: true, fileSizeLimit: 52428800 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const mimeType = file.type || 'application/octet-stream'
    const filename = file.name
    const isCSV = filename.toLowerCase().endsWith('.csv') || mimeType === 'text/csv'

    // Ensure bucket exists
    await ensureBucket(supabase)

    // Upload to Supabase Storage
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageKey = `uploads/${Date.now()}_${safeFilename}`
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storageKey, buffer, { contentType: mimeType })

    if (storageError) {
      return NextResponse.json({ error: `Storage fout: ${storageError.message}` }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storageKey)

    // Create document record
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: storageKey,
        original_filename: filename,
        file_url: urlData?.publicUrl,
        file_type: isCSV ? 'bankafschrift' : 'factuur',
        source: 'upload',
        status: 'pending',
      })
      .select()
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: `Document opslaan mislukt: ${docError?.message}` }, { status: 500 })
    }

    // Process with Claude
    let result
    if (isCSV) {
      const csvText = buffer.toString('utf-8')
      result = await processINGCSV(csvText)
    } else if (mimeType === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      try {
        const pdfData = await pdfParse(buffer)
        result = await processDocument(pdfData.text, 'text/plain', filename)
      } catch {
        result = await processDocument(buffer, mimeType, filename)
      }
    } else {
      result = await processDocument(buffer, mimeType, filename)
    }

    if (result.success && result.transactions.length > 0) {
      await supabase.from('transactions').insert(
        result.transactions.map(t => ({ ...t, document_id: doc.id }))
      )
      await supabase.from('documents').update({
        status: 'processed',
        raw_text: result.raw_text,
        file_type: result.document_type as never,
        processed_at: new Date().toISOString(),
        kwartaal: result.transactions[0]?.kwartaal,
      }).eq('id', doc.id)
    } else if (result.success) {
      await supabase.from('documents').update({
        status: 'flagged',
        raw_text: result.raw_text,
      }).eq('id', doc.id)
    } else {
      await supabase.from('documents').update({
        status: 'error',
        processing_error: result.error,
      }).eq('id', doc.id)
    }

    return NextResponse.json({
      success: true,
      document_id: doc.id,
      transactions_count: result.transactions.length,
      document_type: result.document_type,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Onbekende fout' },
      { status: 500 }
    )
  }
}
