'use client'

import { useEffect, useState } from 'react'
import { formatEuro, getCurrentKwartaal } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

function getYears() {
  const year = new Date().getFullYear()
  return [year, year - 1, year - 2]
}

function getAvailableKwartalen(year: number) {
  const now = new Date()
  const curQ = Math.ceil((now.getMonth() + 1) / 3)
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].filter(q => {
    if (year < now.getFullYear()) return true
    return parseInt(q[1]) <= curQ
  })
  return quarters
}

interface Stats {
  doc_count: number
  pending_count: number
  transactions_count: number
  omzet: number
  kosten: number
  btw_ontvangen: number
  btw_betaald: number
  btw_te_betalen: number
}

export default function DashboardPage() {
  const curKwartaal = getCurrentKwartaal()
  const [jaar, setJaar] = useState(new Date().getFullYear())
  const [kwartaal, setKwartaal] = useState<string>(curKwartaal.split('-')[1]) // e.g. "Q2"
  const [modeJaar, setModeJaar] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const years = getYears()
  const quarters = getAvailableKwartalen(jaar)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams(
      modeJaar ? { jaar: String(jaar) } : { kwartaal: `${jaar}-${kwartaal}` }
    )
    fetch(`/api/data/dashboard-stats?${params}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
  }, [jaar, kwartaal, modeJaar])

  const periodLabel = modeJaar ? `Heel ${jaar}` : `${kwartaal} ${jaar}`

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">{periodLabel}</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          {/* Year */}
          <div className="relative">
            <select
              value={jaar}
              onChange={e => setJaar(parseInt(e.target.value))}
              className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-gray-700 cursor-pointer"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Quarter / Heel jaar */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setModeJaar(true)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                modeJaar ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Heel jaar
            </button>
            {quarters.map(q => (
              <button
                key={q}
                onClick={() => { setModeJaar(false); setKwartaal(q) }}
                className={`px-3 py-2 text-xs font-medium border-l border-gray-200 transition-colors ${
                  !modeJaar && kwartaal === q ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BTW Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Omzet (excl. BTW)"
          value={loading ? '…' : formatEuro(stats?.omzet ?? 0)}
          color="green"
          subtitle={loading ? '' : `BTW ontvangen: ${formatEuro(stats?.btw_ontvangen ?? 0)}`}
        />
        <SummaryCard
          title="Kosten (excl. BTW)"
          value={loading ? '…' : formatEuro(stats?.kosten ?? 0)}
          color="red"
          subtitle={loading ? '' : `BTW betaald: ${formatEuro(stats?.btw_betaald ?? 0)}`}
        />
        <SummaryCard
          title={(stats?.btw_te_betalen ?? 0) >= 0 ? 'Te betalen BTW' : 'Terug te krijgen'}
          value={loading ? '…' : formatEuro(Math.abs(stats?.btw_te_betalen ?? 0))}
          color={(stats?.btw_te_betalen ?? 0) >= 0 ? 'orange' : 'blue'}
          subtitle={loading ? '' : `${stats?.transactions_count ?? 0} transacties`}
        />
        <SummaryCard
          title="Documenten"
          value={loading ? '…' : String(stats?.doc_count ?? 0)}
          color="purple"
          subtitle={loading ? '' : (stats?.pending_count ?? 0) > 0
            ? `${stats?.pending_count} wachten op verwerking`
            : 'Alles verwerkt'}
        />
      </div>

      {/* Result */}
      {!loading && stats && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500 mb-1">Netto resultaat {periodLabel}</p>
          <p className={`text-3xl font-bold ${(stats.omzet - stats.kosten) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatEuro(stats.omzet - stats.kosten)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatEuro(stats.omzet)} omzet − {formatEuro(stats.kosten)} kosten
          </p>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  title, value, color, subtitle
}: {
  title: string
  value: string
  color: 'green' | 'red' | 'orange' | 'blue' | 'purple'
  subtitle: string
}) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }

  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs mt-1 opacity-70">{subtitle}</p>
    </div>
  )
}
