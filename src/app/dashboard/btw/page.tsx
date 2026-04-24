'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatEuro, kwartaalLabel, getCurrentKwartaal } from '@/lib/utils'
import { BTWSummary, Transaction } from '@/lib/types'
import { Download, FileSpreadsheet, ChevronDown } from 'lucide-react'

function getAvailableKwartalen(): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const quarters = []
  for (let y = year; y >= year - 2; y--) {
    for (let q = 4; q >= 1; q--) {
      if (y === year && q > Math.ceil((now.getMonth() + 1) / 3)) continue
      quarters.push(`${y}-Q${q}`)
    }
  }
  return quarters
}

export default function BTWPage() {
  const [kwartaal, setKwartaal] = useState(getCurrentKwartaal())
  const [summary, setSummary] = useState<BTWSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('kwartaal', kwartaal)
        .order('datum', { ascending: true })

      const txs = (data || []) as Transaction[]
      setTransactions(txs)

      const inkomend = txs.filter(t => t.type === 'inkomend')
      const uitgaand = txs.filter(t => t.type === 'uitgaand')
      const btw_ontvangen = uitgaand.reduce((s, t) => s + (t.btw_bedrag || 0), 0)
      const btw_betaald = inkomend.reduce((s, t) => s + (t.btw_bedrag || 0), 0)

      setSummary({
        kwartaal,
        omzet_excl_btw: uitgaand.reduce((s, t) => s + t.bedrag_excl_btw, 0),
        btw_ontvangen,
        kosten_excl_btw: inkomend.reduce((s, t) => s + t.bedrag_excl_btw, 0),
        btw_betaald,
        te_betalen_btw: btw_ontvangen - btw_betaald,
        transacties_count: txs.length,
      })
      setLoading(false)
    }
    load()
  }, [kwartaal])

  const exportExcel = async () => {
    setExporting(true)
    const res = await fetch(`/api/export?kwartaal=${kwartaal}&format=excel`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `btw-aangifte-${kwartaal}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const kwartalen = getAvailableKwartalen()

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BTW Aangifte</h1>
          <p className="text-gray-500 mt-1">Overzicht per kwartaal voor de belastingdienst</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Kwartaal selector */}
          <div className="relative">
            <select
              value={kwartaal}
              onChange={e => setKwartaal(e.target.value)}
              className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-gray-700 cursor-pointer"
            >
              {kwartalen.map(kw => (
                <option key={kw} value={kw}>{kwartaalLabel(kw)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={exportExcel}
            disabled={exporting || !summary}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exporting ? 'Exporteren...' : 'Exporteer Excel'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />)}
        </div>
      ) : summary ? (
        <>
          {/* BTW Declaration Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-5">
              Aangifte {kwartaalLabel(kwartaal)}
            </h2>

            <div className="space-y-4">
              {/* Section 1: Omzet */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Rubriek 1 — Prestaties binnenland
                </h3>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-700">1a. Leveringen/diensten belast met 21%</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Omzet: {formatEuro(summary.omzet_excl_btw)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{formatEuro(summary.btw_ontvangen)}</p>
                </div>
              </div>

              {/* Section 5: Voorbelasting */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Rubriek 5 — Voorbelasting
                </h3>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-700">5b. Voorbelasting</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Kosten: {formatEuro(summary.kosten_excl_btw)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{formatEuro(summary.btw_betaald)}</p>
                </div>
              </div>

              {/* Result */}
              <div className={`rounded-lg p-5 border-2 ${
                summary.te_betalen_btw > 0
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {summary.te_betalen_btw > 0 ? 'Te betalen BTW' : 'Terug te krijgen BTW'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      BTW ontvangen ({formatEuro(summary.btw_ontvangen)}) − voorbelasting ({formatEuro(summary.btw_betaald)})
                    </p>
                  </div>
                  <p className={`text-2xl font-bold ${
                    summary.te_betalen_btw > 0 ? 'text-orange-600' : 'text-blue-600'
                  }`}>
                    {formatEuro(Math.abs(summary.te_betalen_btw))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions table */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Transacties ({summary.transacties_count})
            </h2>
            {transactions.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">Geen transacties in dit kwartaal</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="pb-3 font-medium">Datum</th>
                      <th className="pb-3 font-medium">Leverancier</th>
                      <th className="pb-3 font-medium">Categorie</th>
                      <th className="pb-3 font-medium text-right">Excl. BTW</th>
                      <th className="pb-3 font-medium text-right">BTW</th>
                      <th className="pb-3 font-medium text-right">Incl. BTW</th>
                      <th className="pb-3 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="py-2.5 text-gray-600">{t.datum}</td>
                        <td className="py-2.5 text-gray-900 font-medium max-w-32 truncate">{t.leverancier || '—'}</td>
                        <td className="py-2.5 text-gray-500">{t.categorie || '—'}</td>
                        <td className="py-2.5 text-right text-gray-700">{formatEuro(t.bedrag_excl_btw)}</td>
                        <td className="py-2.5 text-right text-gray-500">{formatEuro(t.btw_bedrag || 0)}</td>
                        <td className="py-2.5 text-right text-gray-700 font-medium">{formatEuro(t.bedrag_incl_btw || 0)}</td>
                        <td className="py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            t.type === 'inkomend'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-green-50 text-green-600'
                          }`}>
                            {t.type === 'inkomend' ? 'Kosten' : 'Omzet'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
