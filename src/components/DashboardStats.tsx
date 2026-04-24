'use client'

import { useEffect, useState } from 'react'
import { formatEuro, kwartaalLabel } from '@/lib/utils'
import { BTWSummary } from '@/lib/types'

export default function DashboardStats() {
  const [data, setData] = useState<BTWSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const year = new Date().getFullYear()
      const kwartalen = [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`]

      const results = await Promise.all(
        kwartalen.map(async (kw) => {
          const res = await fetch(`/api/data/transactions?kwartaal=${kw}&type=all`)
          const json = await res.json()
          const transactions: Array<{ type: string; bedrag_excl_btw: number; btw_bedrag?: number }> = json.transactions || []

          const inkomend = transactions.filter(t => t.type === 'inkomend')
          const uitgaand = transactions.filter(t => t.type === 'uitgaand')

          const omzet_excl_btw = uitgaand.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)
          const btw_ontvangen = uitgaand.reduce((s, t) => s + (t.btw_bedrag || 0), 0)
          const kosten_excl_btw = inkomend.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)
          const btw_betaald = inkomend.reduce((s, t) => s + (t.btw_bedrag || 0), 0)

          return {
            kwartaal: kw,
            omzet_excl_btw,
            btw_ontvangen,
            kosten_excl_btw,
            btw_betaald,
            te_betalen_btw: btw_ontvangen - btw_betaald,
            transacties_count: transactions.length,
          } satisfies BTWSummary
        })
      )

      setData(results)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="h-48 bg-white rounded-xl border border-gray-200 animate-pulse mb-6" />

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Jaarsoverzicht {new Date().getFullYear()}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-3 font-medium">Kwartaal</th>
              <th className="pb-3 font-medium text-right">Omzet</th>
              <th className="pb-3 font-medium text-right">Kosten</th>
              <th className="pb-3 font-medium text-right">BTW Ontvangen</th>
              <th className="pb-3 font-medium text-right">BTW Betaald</th>
              <th className="pb-3 font-medium text-right">Te Betalen / Terug</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row) => (
              <tr key={row.kwartaal} className="py-3">
                <td className="py-3 font-medium text-gray-900">{kwartaalLabel(row.kwartaal)}</td>
                <td className="py-3 text-right text-gray-700">{formatEuro(row.omzet_excl_btw)}</td>
                <td className="py-3 text-right text-gray-700">{formatEuro(row.kosten_excl_btw)}</td>
                <td className="py-3 text-right text-green-600">{formatEuro(row.btw_ontvangen)}</td>
                <td className="py-3 text-right text-red-500">{formatEuro(row.btw_betaald)}</td>
                <td className={`py-3 text-right font-semibold ${row.te_betalen_btw > 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                  {row.te_betalen_btw > 0
                    ? `Te betalen: ${formatEuro(row.te_betalen_btw)}`
                    : `Terug: ${formatEuro(Math.abs(row.te_betalen_btw))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
