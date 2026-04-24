import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// PATCH /api/data/transactions/bulk — update categorie/btw on multiple transactions
export async function PATCH(req: NextRequest) {
  try {
    const { ids, categorie, btw_percentage } = await req.json() as {
      ids: string[]
      categorie?: string
      btw_percentage?: number
    }

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: 'Geen IDs opgegeven' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = {}
    if (categorie !== undefined) updates.categorie = categorie
    if (btw_percentage !== undefined) {
      updates.btw_percentage = btw_percentage
      // Recalculate BTW amounts for each transaction individually
      const { data: txs } = await supabase.from('transactions').select('id, bedrag_incl_btw').in('id', ids)
      if (txs) {
        await Promise.all(txs.map(async (t: { id: string; bedrag_incl_btw: number }) => {
          const factor = btw_percentage / 100
          const excl = (t.bedrag_incl_btw || 0) / (1 + factor)
          const btw = (t.bedrag_incl_btw || 0) - excl
          return supabase.from('transactions').update({
            btw_percentage,
            bedrag_excl_btw: Math.round(excl * 100) / 100,
            btw_bedrag: Math.round(btw * 100) / 100,
            ...(categorie !== undefined ? { categorie } : {}),
          }).eq('id', t.id)
        }))
        return NextResponse.json({ ok: true, updated: txs.length })
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('transactions').update(updates).in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, updated: ids.length })
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }
}

// DELETE /api/data/transactions/bulk — delete multiple transactions
export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json() as { ids: string[] }
    if (!ids || ids.length === 0) return NextResponse.json({ error: 'Geen IDs' }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase.from('transactions').delete().in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, deleted: ids.length })
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }
}
