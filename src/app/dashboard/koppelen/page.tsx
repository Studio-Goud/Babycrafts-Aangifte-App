'use client'

import { useEffect, useState } from 'react'
import { Document, Transaction } from '@/lib/types'
import { formatDate, formatEuro } from '@/lib/utils'
import { Link2, FileText, Search, X, CheckCircle, ExternalLink, ChevronRight } from 'lucide-react'

export default function KoppelenPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [linkedDocIds, setLinkedDocIds] = useState<Set<string>>(new Set())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const [docSearch, setDocSearch] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [txSearch, setTxSearch] = useState('')
  const [linking, setLinking] = useState(false)

  async function load() {
    setLoading(true)
    const [docsRes, txRes] = await Promise.all([
      fetch('/api/data/documents?status=processed'),
      fetch('/api/data/transactions?kwartaal=all&type=inkomend'),
    ])
    const docsJson = await docsRes.json()
    const txJson = await txRes.json()

    const allDocs: Document[] = docsJson.documents || []
    const allTx: Transaction[] = txJson.transactions || []

    // Only show non-bankafschrift docs
    const invoiceDocs = allDocs.filter(d => d.file_type !== 'bankafschrift')

    // Track which doc IDs are already linked via a transaction's document_id
    const linked = new Set(
      allTx.map((t: Transaction) => t.document_id).filter(Boolean) as string[]
    )

    setDocs(invoiceDocs)
    setLinkedDocIds(linked)
    setTransactions(allTx)
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
  const filteredTx = transactions.filter(t =>
    !tq ||
    (t.leverancier || '').toLowerCase().includes(tq) ||
    (t.beschrijving || '').toLowerCase().includes(tq) ||
    (t.datum || '').includes(tq)
  )

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
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-gray-900">Kies ING-transactie</h3>
              <button onClick={() => { setSelectedDoc(null); setTxSearch('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4 truncate">{selectedDoc.original_filename}</p>

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
              ) : filteredTx.map(t => (
                <button
                  key={t.id}
                  onClick={() => linkToTransaction(t.id)}
                  disabled={linking}
                  className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {t.leverancier || t.beschrijving || 'Onbekend'}
                      </p>
                      <p className="text-xs text-gray-400">{t.datum} · {t.kwartaal}</p>
                      {t.categorie && (
                        <p className="text-xs text-blue-600 mt-0.5">{t.categorie}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">
                        {formatEuro(t.bedrag_incl_btw ?? t.bedrag_excl_btw)}
                      </p>
                      {t.document_id && (
                        <p className="text-xs text-orange-400">al gekoppeld</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
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

function DocRow({ doc, linked, onLink }: { doc: Document; linked: boolean; onLink: () => void }) {
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
