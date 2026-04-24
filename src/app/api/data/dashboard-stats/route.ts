import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentKwartaal } from '@/lib/utils'

interface TxRow {
  bedrag_excl_btw: number
  btw_bedrag: number | null
  type: string
}

export async function GET() {
  const supabase = createServiceClient()
  const kwartaal = getCurrentKwartaal()

  const [
    { count: doc_count },
    { count: pending_count },
    { data: transactions },
  ] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('transactions').select('bedrag_excl_btw, btw_bedrag, type').eq('kwartaal', kwartaal),
  ])

  const txs = (transactions || []) as TxRow[]
  const inkomend = txs.filter(t => t.type === 'inkomend')
  const uitgaand = txs.filter(t => t.type === 'uitgaand')

  const omzet = uitgaand.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)
  const kosten = inkomend.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)
  const btw_ontvangen = uitgaand.reduce((s, t) => s + (t.btw_bedrag || 0), 0)
  const btw_betaald = inkomend.reduce((s, t) => s + (t.btw_bedrag || 0), 0)
  const btw_te_betalen = btw_ontvangen - btw_betaald

  return NextResponse.json({
    doc_count: doc_count || 0,
    pending_count: pending_count || 0,
    transactions_this_quarter: txs.length,
    omzet,
    kosten,
    btw_te_betalen,
  })
}
