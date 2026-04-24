import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { Transaction, getKwartaal } from '@/lib/types'

export async function DELETE(req: NextRequest) {
  const kwartaal = req.nextUrl.searchParams.get('kwartaal')
  if (!kwartaal) return NextResponse.json({ error: 'kwartaal vereist' }, { status: 400 })

  const supabase = createServiceClient()

  // Delete all transactions for this quarter
  const { error: txErr } = await supabase.from('transactions').delete().eq('kwartaal', kwartaal)
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  // Also delete all documents (and their storage files) for this quarter
  const { data: docs } = await supabase.from('documents').select('id, filename').eq('kwartaal', kwartaal)
  if (docs && docs.length > 0) {
    const keys = docs.map((d: { filename: string }) => d.filename).filter(Boolean)
    if (keys.length) await supabase.storage.from('Documents').remove(keys)
    const ids = docs.map((d: { id: string }) => d.id)
    await supabase.from('documents').delete().in('id', ids)
  }

  return NextResponse.json({ ok: true, transactions_deleted: true, documents_deleted: docs?.length ?? 0 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const kwartaal = searchParams.get('kwartaal') || getKwartaal(new Date())
  const type = searchParams.get('type') || 'all'

  const supabase = createServiceClient()
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('kwartaal', kwartaal)
    .order('datum', { ascending: false })

  if (type !== 'all') {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ transactions: (data || []) as Transaction[] })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      datum,
      leverancier,
      beschrijving,
      categorie,
      bedrag_incl_btw,
      btw_percentage,
      type,
    } = body as {
      datum: string
      leverancier?: string
      beschrijving?: string
      categorie?: string
      bedrag_incl_btw: number
      btw_percentage: number
      type: 'inkomend' | 'uitgaand'
    }

    if (!datum || bedrag_incl_btw == null || btw_percentage == null || !type) {
      return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
    }

    const btwFactor = btw_percentage / 100
    const bedrag_excl_btw = bedrag_incl_btw / (1 + btwFactor)
    const btw_bedrag = bedrag_incl_btw - bedrag_excl_btw

    const datumDate = new Date(datum)
    const kwartaal = getKwartaal(datumDate)
    const jaar = datumDate.getFullYear()
    const maand = datumDate.getMonth() + 1

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        datum,
        leverancier: leverancier || null,
        beschrijving: beschrijving || null,
        categorie: categorie || null,
        bedrag_excl_btw: Math.round(bedrag_excl_btw * 100) / 100,
        btw_percentage,
        btw_bedrag: Math.round(btw_bedrag * 100) / 100,
        bedrag_incl_btw: Math.round(bedrag_incl_btw * 100) / 100,
        type,
        kwartaal,
        jaar,
        maand,
        verified: true,
        document_id: null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ transaction: data as Transaction }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }
}
