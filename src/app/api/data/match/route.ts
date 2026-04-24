import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { Transaction, Document } from '@/lib/types'

export interface MatchSuggestion {
  transaction: Transaction
  matchedDocument: Document | null
  confidence: 'high' | 'low' | null
}

export async function GET() {
  const supabase = createServiceClient()

  // Get transactions that come from bankafschrift documents (ING CSV uploads)
  // Join transactions with their source documents where document file_type = 'bankafschrift'
  const [{ data: allTxs }, { data: processedDocs }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*, document:documents(id, file_type, source, original_filename, kwartaal, created_at, status, processed_at, filename, file_url, source_email, source_subject, raw_text, processing_error)')
      .order('datum', { ascending: false }),
    supabase
      .from('documents')
      .select('*')
      .eq('status', 'processed'),
  ])

  const allTransactions = (allTxs || []) as Array<Transaction & { document?: Document }>
  const documents = (processedDocs || []) as Document[]

  // Bank transactions = those whose linked document is a bankafschrift
  const bankTransactions = allTransactions.filter(
    t => t.document?.file_type === 'bankafschrift'
  )

  // Invoice documents = processed docs from upload/email (not bankafschrift)
  const invoiceDocs = documents.filter(
    d => d.file_type !== 'bankafschrift' && (d.source === 'upload' || d.source === 'email')
  )

  // Track which invoice docs are already linked to a bank transaction
  const linkedInvoiceDocIds = new Set<string>()

  const suggestions: MatchSuggestion[] = bankTransactions.map(tx => {
    const txDate = new Date(tx.datum)

    // Find best matching invoice doc
    let bestMatch: Document | null = null
    let bestConfidence: 'high' | 'low' | null = null

    for (const doc of invoiceDocs) {
      if (linkedInvoiceDocIds.has(doc.id)) continue

      // Check same quarter
      if (doc.kwartaal && tx.kwartaal && doc.kwartaal !== tx.kwartaal) continue

      // Check date proximity
      const docDate = new Date(doc.processed_at || doc.created_at)
      const dayDiff = Math.abs((txDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24))

      if (dayDiff <= 30) {
        bestMatch = doc
        bestConfidence = dayDiff <= 3 ? 'high' : 'low'
        break
      }
    }

    if (bestMatch && bestConfidence === 'high') {
      linkedInvoiceDocIds.add(bestMatch.id)
    }

    // Cast to plain Transaction (without the joined document field)
    const { document: _doc, ...plainTx } = tx
    return {
      transaction: plainTx as Transaction,
      matchedDocument: bestMatch,
      confidence: bestConfidence,
    }
  })

  // Unmatched invoice docs
  const unmatchedDocs = invoiceDocs.filter(d => !linkedInvoiceDocIds.has(d.id))

  return NextResponse.json({ suggestions, unmatchedDocuments: unmatchedDocs })
}
