import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { Transaction } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kwartaal = searchParams.get('kwartaal')
  const format = searchParams.get('format') || 'excel'

  if (!kwartaal) {
    return NextResponse.json({ error: 'Kwartaal is verplicht' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('transactions')
    .select('*, documents(*)')
    .eq('kwartaal', kwartaal)
    .order('datum', { ascending: true })

  if (!data) {
    return NextResponse.json({ error: 'Geen data' }, { status: 404 })
  }

  const transactions: Transaction[] = data as Transaction[]

  if (format === 'excel') {
    const XLSX = await import('xlsx')
    const rows = transactions.map((t: Transaction) => ({
      Datum: t.datum,
      Type: t.type === 'inkomend' ? 'Kosten' : 'Omzet',
      Leverancier: t.leverancier || '',
      Beschrijving: t.beschrijving || '',
      Categorie: t.categorie || '',
      'Bedrag excl. BTW': t.bedrag_excl_btw,
      'BTW %': t.btw_percentage || 0,
      'BTW bedrag': t.btw_bedrag || 0,
      'Bedrag incl. BTW': t.bedrag_incl_btw || 0,
      'Factuur nummer': t.factuur_nummer || '',
      'BTW nummer': t.btw_nummer || '',
      Kwartaal: t.kwartaal,
    }))

    // Summary row
    const inkomend = transactions.filter(t => t.type === 'inkomend')
    const uitgaand = transactions.filter(t => t.type === 'uitgaand')
    const btw_ontvangen = uitgaand.reduce((s, t) => s + (t.btw_bedrag || 0), 0)
    const btw_betaald = inkomend.reduce((s, t) => s + (t.btw_bedrag || 0), 0)

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Transacties')

    // Summary sheet
    const summaryData = [
      ['BTW AANGIFTE OVERZICHT', ''],
      ['Kwartaal', kwartaal],
      ['', ''],
      ['OMZET', ''],
      ['Omzet excl. BTW', uitgaand.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)],
      ['BTW ontvangen (1a)', btw_ontvangen],
      ['', ''],
      ['KOSTEN', ''],
      ['Kosten excl. BTW', inkomend.reduce((s, t) => s + (t.bedrag_excl_btw || 0), 0)],
      ['Voorbelasting BTW (5b)', btw_betaald],
      ['', ''],
      ['TE BETALEN / TERUG', btw_ontvangen - btw_betaald],
    ]

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'BTW Samenvatting')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="btw-aangifte-${kwartaal}.xlsx"`,
      },
    })
  }

  return NextResponse.json({ error: 'Onbekend formaat' }, { status: 400 })
}
