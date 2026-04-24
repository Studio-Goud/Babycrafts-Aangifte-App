'use client'

import { useEffect, useState } from 'react'
import { Document, Transaction } from '@/lib/types'
import { formatDate, formatEuro } from '@/lib/utils'
import { Link2, FileText, Search, X, CheckCircle, ExternalLink, ChevronRight, Euro } from 'lucide-react'

export default function KoppelenPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [linkedDocIds, setLinkedDocIds] = useState<Set<string>>(new Set())
  // All transactions — used both for amount lookup and link modal
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  // Map: invoice document_id → extracted bedrag_incl_btw from Claude
  const [docAmounts, setDocAmounts] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  const [docSearch, setDocSearch] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [txSearch, setTxSearch] = useState('')
  const [linking, setLinking] = useState(false)

  async function load() {
    setLoading(true)
    const [docsRes, txRes] = await Promise.all([
      fetch('/api/data/documents?status=processed'),
      fetch('/api/data/transactions?kwartaal=all'),
    ])
    const docsJson = await docsRes.json()
    const txJson = await txRes.json()

    const allDocs: Document[] = docsJson.documents || []
    const allTx: Transaction[] = txJson.transactions || []

    // Only show non-bankafschrift docs (actual invoices / receipts)
    const invoiceDocs = allDocs.filter(d => d.file_type !== 'bankafschrift')
    const bankDocs = new Set(allDocs.filter(d => d.file_type === 'bankafschrift').map(d => d.id))

    // Build map: invoice doc_id → total bedrag extracted by Claude
    const amountMap = new Map<string, number>()
    for (const tx of allTx) {
      if (tx.document_id && !bankDocs.has(tx.document_id)) {
        const prev = amountMap.get(tx.document_id) ?? 0
        amountMap.set(tx.document_id, prev + (tx.bedrag_incl_btw ?? tx.bedrag_excl_btw ?? 0))
      }
    }

    // ING transactions = those linked to a bankafschrift doc, OR no doc at all
    // These are the ones the user picks from in the link modal
    const ingTx = allTx.filter(t => !t.document_id || bankDocs.has(t.document_id))

    // Track which invoice docs are already linked via a transaction's document_id
    // A doc is "linked" when an ING transaction has document_id = that doc's id
    const linked = new Set(
      allTx
        .filter(t => t.document_id && !bankDocs.has(t.document_id))
        .map(t => t.document_id as string)
    )

    setDocs(invoiceDocs)
    setLinkedDocIds(linked)
    setDocAmounts(amountMap)
    setAllTransactions(ingTx)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const linkToTransaction = async (txId: string) => {
    if (!selectedDoc) return
    setLinking(true)
    await fetch(`/api/data/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: selectedDoc.id }),
    })
    setLinking(false)
    setSelectedDoc(null)
    setTxSearch('')
    await load()
  }

  const unlinked = docs.filter(d => !linkedDocIds.has(d.id))
  const linked = docs.filter(d => linkedDocIds.has(d.id))

  const dq = docSearch.trim().toLowerCase()
  const filteredUnlinked = unlinked.filter(d =>
    !dq ||
    (d.original_filename || '').toLowerCase().includes(dq) ||
    (d.file_type || '').toLowerCase().includes(dq) ||
    (d.kwartaal || '').toLowerCase().includes(dq)
  )
  const filteredLinked = linked.filter(d =>
    !dq ||
    (d.original_filename || '').toLowerCase().includes(dq) ||
    (d.file_type || '').toLowerCase().includes(dq) ||
    (d.kwartaal || '').toLowerCase().includes(dq)
  )

  const tq = txSearch.trim().toLowerCase()
  const invoiceAmount = selectedDoc ? (docAmounts.get(selectedDoc.id) ?? null) : null
  const filteredTx = allTransactions
    .filter(t =>
      !tq ||
      (t.leverancier || '').toLowerCase().includes(tq) ||
      (t.beschrijving || '').toLowerCase().includes(tq) ||
      (t.datum || '').includes(tq)
    )
    .sort((a, b) => {
      // Sort by amount proximity to invoice amount
      if (invoiceAmount === null) return 0
      const aDiff = Math.abs((a.bedrag_incl_btw ?? a.bedrag_excl_btw ?? 0) - invoiceAmount)
      const bDiff = Math.abs((b.bedrag_incl_btw ?? b.bedrag_excl_btw ?? 0) - invoiceAmount)
      return aDiff - bDiff
    })

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Koppelen</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Koppelen</h1>
        <p className="text-gray-500 mt-1">Koppel facturen aan ING-transacties</p>
      </div>

      {/* Link modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-gray-900">Kies ING-transactie</h3>
              <button onClick={() => { setSelectedDoc(null); setTxSearch('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-1 truncate">{selectedDoc.original_filename}</p>

            {/* Invoice amount badge */}
            {invoiceAmount !== null && invoiceAmount > 0 && (
              <div className="flex items-center gap-1.5 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                <Euro className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-blue-700 font-medium">Factuurbedrag: {formatEuro(invoiceAmount)}</span>
                <span className="text-blue-400 text-xs ml-1">— beste match bovenaan</span>
              </div>
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="Zoek op leverancier, omschrijving of datum…"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto flex-1 space-y-1.5">
              {filteredTx.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Geen transacties gevonden</p>
              ) : filteredTx.map(t => {
                const txAmount = t.bedrag_incl_btw ?? t.bedrag_excl_btw ?? 0
                const diff = invoiceAmount !== null ? Math.abs(txAmount - invoiceAmount) : null
                const isExact = diff !== null && diff < 0.02
                const isClose = diff !== null && diff <= invoiceAmount! * 0.05

                return (
                  <button
                    key={t.id}
                    onClick={() => linkToTransaction(t.id)}
                    disabled={linking}
                    className={`w-full text-left border rounded-lg px-4 py-3 transition-colors disabled:opacity-50 ${
                      isExact
                        ? 'border-green-400 bg-green-50 hover:bg-green-100'
                        : isClose
                        ? 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {t.leverancier || t.beschrijving || 'Onbekend'}
                          </p>
                          {isExact && (
                            <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded shrink-0">Exacte match</span>
                          )}
                          {!isExact && isClose && (
                            <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">Dichtbij</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{t.datum} · {t.kwartaal}</p>
                        {t.categorie && (
                          <p className="text-xs text-gray-500 mt-0.5">{t.categorie}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isExact ? 'text-green-700' : 'text-gray-900'}`}>
                          {formatEuro(txAmount)}
                        </p>
                        {diff !== null && diff > 0.02 && (
                          <p className="text-xs text-gray-400">±{formatEuro(diff)}</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={docSearch}
          onChange={e => setDocSearch(e.target.value)}
          placeholder="Zoek op bestandsnaam, type, kwartaal…"
          className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {docSearch && (
          <button onClick={() => setDocSearch('')} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">Geen facturen gevonden</p>
          <p className="text-sm mt-1">Upload facturen via de Uploaden pagina.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Unlinked */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-400" />
              Te koppelen ({filteredUnlinked.length})
            </h2>
            {filteredUnlinked.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
                {dq ? `Geen resultaten voor "${docSearch}"` : 'Alle facturen zijn gekoppeld 🎉'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUnlinked.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    linked={false}
                    amount={docAmounts.get(doc.id) ?? null}
                    onLink={() => { setSelectedDoc(doc); setTxSearch('') }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Linked */}
          {filteredLinked.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Gekoppeld ({filteredLinked.length})
              </h2>
              <div className="space-y-2">
                {filteredLinked.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    linked={true}
                    amount={docAmounts.get(doc.id) ?? null}
                    onLink={() => { setSelectedDoc(doc); setTxSearch('') }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, linked, amount, onLink }: {
  doc: Document
  linked: boolean
  amount: number | null
  onLink: () => void
}) {
  return (
    <div className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-4 ${
      linked ? 'border-green-200' : 'border-gray-200'
    }`}>
      <FileText className={`w-5 h-5 shrink-0 ${linked ? 'text-green-400' : 'text-gray-300'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{doc.original_filename}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {doc.file_type} · {doc.kwartaal || '—'} · {formatDate(doc.created_at)}
        </p>
      </div>
      {/* Extracted amount badge */}
      {amount !== null && amount > 0 && (
        <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0">
          {formatEuro(amount)}
        </span>
      )}
      {linked && (
        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">Gekoppeld</span>
      )}
      {doc.file_url && (
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
          className="text-gray-300 hover:text-blue-500 transition-colors shrink-0" title="Bekijken"
          onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
      <button
        onClick={onLink}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
          linked
            ? 'border border-gray-200 text-gray-500 hover:bg-gray-50'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        <Link2 className="w-3.5 h-3.5" />
        {linked ? 'Wijzig' : 'Koppel'}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  )
}
