import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/claude-processor'

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: 'Document niet gevonden' }, { status: 404 })

  // Download from storage
  const { data: fileData } = await supabase.storage
    .from('documents')
    .download(doc.filename)

  if (!fileData) return NextResponse.json({ error: 'Bestand niet gevonden in storage' }, { status: 404 })

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const mimeType = doc.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'

  let result
  if (mimeType === 'application/pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    try {
      const pdfData = await pdfParse(buffer)
      result = await processDocument(pdfData.text, 'text/plain', doc.original_filename)
    } catch {
      result = await processDocument(buffer, mimeType, doc.original_filename)
    }
  } else {
    result = await processDocument(buffer, mimeType, doc.original_filename)
  }

  // Delete old transactions
  await supabase.from('transactions').delete().eq('document_id', id)

  if (result.success && result.transactions.length > 0) {
    await supabase.from('transactions').insert(
      result.transactions.map(t => ({ ...t, document_id: id }))
    )
    await supabase.from('documents').update({
      status: 'processed',
      raw_text: result.raw_text,
      processing_error: null,
      processed_at: new Date().toISOString(),
      kwartaal: result.transactions[0]?.kwartaal,
    }).eq('id', id)
  } else {
    await supabase.from('documents').update({
      status: result.success ? 'flagged' : 'error',
      processing_error: result.error,
    }).eq('id', id)
  }

  return NextResponse.json({ success: true, transactions_count: result.transactions.length })
}
