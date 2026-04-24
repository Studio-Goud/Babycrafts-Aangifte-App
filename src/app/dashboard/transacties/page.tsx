'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Transaction } from '@/lib/types'
import { formatEuro, getCurrentKwartaal, kwartaalLabel } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

function getAvailableKwartalen() {
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

export default function TransactiesPage() {
  const [kwartaal, setKwartaal] = useState(getCurrentKwartaal())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'inkomend' | 'uitgaand'>('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('kwartaal', kwartaal)
        .order('datum', { ascending: false })

      if (filter !== 'all') query = query.eq('type', filter)

      const { data } = await query
      setTransactions((data || []) as Transaction[])
      setLoading(false)
    }
    load()
  }, [kwartaal, filter])

  const kwartalen = getAvailableKwartalen()
  const totaalKosten = transactions.filter(t => t.type === 'inkomend').reduce((s, t) => s + t.bedrag_excl_btw, 0)
  const totaalOmzet = transactions.filter(t => t.type === 'uitgaand').reduce((s, t) => s + t.bedrag_excl_btw, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transacties</h1>
          <p className="text-gray-500 mt-1">Alle ingeboekte transacties</p>
        </div>
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
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Omzet excl. BTW</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatEuro(totaalOmzet)}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-red-600 font-medium">Kosten excl. BTW</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatEuro(totaalKosten)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-600 font-medium">Resultaat</p>
          <p className={`text-xl font-bold mt-1 ${totaalOmzet - totaalKosten >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatEuro(totaalOmzet - totaalKosten)}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'inkomend', 'uitgaand'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'Alle' : f === 'inkomend' ? 'Kosten' : 'Omzet'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-white rounded animate-pulse" />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p>Geen transacties in dit kwartaal</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Leverancier</th>
                <th className="px-4 py-3 font-medium">Beschrijving</th>
                <th className="px-4 py-3 font-medium">Categorie</th>
                <th className="px-4 py-3 font-medium text-right">Excl. BTW</th>
                <th className="px-4 py-3 font-medium text-right">BTW</th>
                <th className="px-4 py-3 font-medium text-right">Incl. BTW</th>
                <th className="px-4 py-3 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600">{t.datum}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-32 truncate">{t.leverancier || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-40 truncate">{t.beschrijving || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{t.categorie || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatEuro(t.bedrag_excl_btw)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">{t.btw_percentage || 0}%</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatEuro(t.bedrag_incl_btw || 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      t.type === 'inkomend' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
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
  )
}
