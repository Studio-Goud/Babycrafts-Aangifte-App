import { createServiceClient } from '@/lib/supabase/server'
import { formatEuro, getCurrentKwartaal, kwartaalLabel } from '@/lib/utils'
import { BTWSummary, Transaction } from '@/lib/types'
import DashboardStats from '@/components/DashboardStats'
import RecentDocuments from '@/components/RecentDocuments'

async function getBTWSummary(kwartaal: string): Promise<BTWSummary> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('kwartaal', kwartaal)

  const transactions = (data || []) as Transaction[]
  const inkomend = transactions.filter(t => t.type === 'inkomend')
  const uitgaand = transactions.filter(t => t.type === 'uitgaand')

  const kosten_excl_btw = inkomend.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)
  const btw_betaald = inkomend.reduce((s, t) => s + (t.btw_bedrag || 0), 0)
  const omzet_excl_btw = uitgaand.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)
  const btw_ontvangen = uitgaand.reduce((s, t) => s + (t.btw_bedrag || 0), 0)

  return {
    kwartaal,
    omzet_excl_btw,
    btw_ontvangen,
    kosten_excl_btw,
    btw_betaald,
    te_betalen_btw: btw_ontvangen - btw_betaald,
    transacties_count: transactions.length,
  }
}

async function getStats() {
  const supabase = createServiceClient()
  const [{ count: docs }, { count: pending }, { data: lastSync }] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('email_sync_log').select('synced_at, documents_created').order('synced_at', { ascending: false }).limit(1),
  ])
  return {
    total_documents: docs || 0,
    pending_documents: pending || 0,
    last_sync: lastSync?.[0]?.synced_at,
    last_sync_count: lastSync?.[0]?.documents_created || 0,
  }
}

export default async function DashboardPage() {
  const kwartaal = getCurrentKwartaal()
  const [summary, stats] = await Promise.all([getBTWSummary(kwartaal), getStats()])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Huidig kwartaal: {kwartaalLabel(kwartaal)}</p>
      </div>

      {/* BTW Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Omzet (excl. BTW)"
          value={formatEuro(summary.omzet_excl_btw)}
          color="green"
          subtitle={`BTW ontvangen: ${formatEuro(summary.btw_ontvangen)}`}
        />
        <SummaryCard
          title="Kosten (excl. BTW)"
          value={formatEuro(summary.kosten_excl_btw)}
          color="red"
          subtitle={`BTW betaald: ${formatEuro(summary.btw_betaald)}`}
        />
        <SummaryCard
          title={summary.te_betalen_btw >= 0 ? 'Te betalen BTW' : 'Terug te krijgen'}
          value={formatEuro(Math.abs(summary.te_betalen_btw))}
          color={summary.te_betalen_btw >= 0 ? 'orange' : 'blue'}
          subtitle={`${summary.transacties_count} transacties`}
        />
        <SummaryCard
          title="Documenten"
          value={stats.total_documents.toString()}
          color="purple"
          subtitle={stats.pending_documents > 0 ? `${stats.pending_documents} wachten op verwerking` : 'Alles verwerkt'}
        />
      </div>

      <DashboardStats />
      <RecentDocuments />
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
