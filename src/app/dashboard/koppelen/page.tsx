'use client'

import { useEffect, useState } from 'react'
import { Transaction, Document } from '@/lib/types'
import { formatEuro, formatDate } from '@/lib/utils'
import { Link2, Unlink, FileText, RefreshCw, CheckCircle } from 'lucide-react'
import type { MatchSuggestion } from '@/app/api/data/match/route'

export default function KoppelenPage() {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [unmatchedDocs, setUnmatchedDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/data/match')
    const json = await res.json()
    setSuggestions(json.suggestions || [])
    setUnmatchedDocs(json.unmatchedDocuments || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const bankTransactions = suggestions.filter(s => !s.matchedDocument || s.confidence === 'low')
  const matchedTransactions = suggestions.filter(s => s.matchedDocument && s.confidence === 'high')

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Koppelen</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Koppelen</h1>
        <p className="text-gray-500 mt-1">Bankafschriften koppelen aan facturen</p>
      </div>

      {suggestions.length === 0 && unmatchedDocs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Link2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">Geen bankafschriften gevonden</p>
          <p className="text-sm mt-1">Upload een ING CSV bankafschrift om transacties te koppelen.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Bank transactions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Matched */}
            {matchedTransactions.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Gekoppeld ({matchedTransactions.length})
                </h2>
                <div className="space-y-2">
                  {matchedTransactions.map(({ transaction, matchedDocument }) => (
                    <MatchCard
                      key={transaction.id}
                      transaction={transaction}
                      matchedDocument={matchedDocument}
                      confidence="high"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched bank transactions */}
            {bankTransactions.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Unlink className="w-4 h-4 text-orange-400" />
                  Niet gekoppeld ({bankTransactions.length})
                </h2>
                <div className="space-y-2">
                  {bankTransactions.map(({ transaction, matchedDocument, confidence }) => (
                    <MatchCard
                      key={transaction.id}
                      transaction={transaction}
                      matchedDocument={matchedDocument}
                      confidence={confidence}
                    />
                  ))}
                </div>
              </div>
            )}

            {suggestions.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                <p>Geen bankafschrift-transacties gevonden</p>
              </div>
            )}
          </div>

          {/* Right column: Unmatched invoices */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Ongekoppelde facturen ({unmatchedDocs.length})
            </h2>
            {unmatchedDocs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
                Alle facturen zijn gekoppeld
              </div>
            ) : (
              <div className="space-y-2">
                {unmatchedDocs.map(doc => (
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.original_filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(doc.created_at)}</p>
                    {doc.kwartaal && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                        {doc.kwartaal}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchCard({
  transaction,
  matchedDocument,
  confidence,
}: {
  transaction: Transaction
  matchedDocument: Document | null
  confidence: 'high' | 'low' | null
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 flex items-start gap-4 ${
      confidence === 'high'
        ? 'border-green-200'
        : confidence === 'low'
        ? 'border-orange-200'
        : 'border-gray-200'
    }`}>
      {/* Transaction info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            transaction.type === 'inkomend' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
          }`}>
            {transaction.type === 'inkomend' ? 'Kosten' : 'Omzet'}
          </span>
          <span className="text-xs text-gray-400">{transaction.datum}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">
          {transaction.leverancier || transaction.beschrijving || 'Onbekend'}
        </p>
        {transaction.beschrijving && transaction.leverancier && (
          <p className="text-xs text-gray-400 truncate">{transaction.beschrijving}</p>
        )}
        <p className="text-sm font-bold text-gray-900 mt-1">
          {formatEuro(transaction.bedrag_incl_btw ?? transaction.bedrag_excl_btw)}
        </p>
      </div>

      {/* Match indicator */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        {confidence === 'high' ? (
          <Link2 className="w-5 h-5 text-green-500" />
        ) : confidence === 'low' ? (
          <Link2 className="w-5 h-5 text-orange-400" />
        ) : (
          <Unlink className="w-5 h-5 text-gray-300" />
        )}
        {confidence === 'low' && (
          <span className="text-xs text-orange-500">Mogelijk</span>
        )}
      </div>

      {/* Matched document */}
      <div className="flex-1 min-w-0">
        {matchedDocument ? (
          <div className={`rounded-lg p-3 ${
            confidence === 'high' ? 'bg-green-50' : 'bg-orange-50'
          }`}>
            <p className="text-xs font-medium text-gray-700 truncate">{matchedDocument.original_filename}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(matchedDocument.created_at)}</p>
          </div>
        ) : (
          <div className="rounded-lg p-3 bg-gray-50 border border-dashed border-gray-200">
            <p className="text-xs text-gray-400 text-center">Niet gekoppeld</p>
          </div>
        )}
      </div>
    </div>
  )
}
