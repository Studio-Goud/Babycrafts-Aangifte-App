import Anthropic from '@anthropic-ai/sdk'
import { getKwartaal } from './types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface ExtractedTransaction {
  datum: string
  leverancier: string
  beschrijving: string
  categorie: string
  bedrag_excl_btw: number
  btw_percentage: number
  btw_bedrag: number
  bedrag_incl_btw: number
  type: 'inkomend' | 'uitgaand'
  btw_nummer?: string
  kvk_nummer?: string
  factuur_nummer?: string
  kwartaal: string
  jaar: number
  maand: number
}

export interface ProcessingResult {
  success: boolean
  transactions: ExtractedTransaction[]
  raw_text: string
  document_type: string
  error?: string
}

const SYSTEM_PROMPT = `Je bent een expert in Nederlandse boekhouding en BTW-administratie voor het bedrijf Babycrafts.
Je taak is het uitlezen en categoriseren van financiële documenten (facturen, bonnen, bankafschriften).

Geef ALTIJD een valide JSON response terug in het volgende formaat, NIETS anders:
{
  "document_type": "factuur|bon|bankafschrift|creditnota|overig",
  "transactions": [
    {
      "datum": "YYYY-MM-DD",
      "leverancier": "naam van leverancier of klant",
      "beschrijving": "korte omschrijving",
      "categorie": "een van: Inkoop goederen|Verkoop goederen|Kantoorkosten|Transport & Logistiek|Marketing & Reclame|Software & Abonnementen|Zakelijk eten & drinken|Telefoon & Internet|Verzekering|Accountant & Advies|Huur & Huisvesting|Personeelskosten|Overig",
      "bedrag_excl_btw": 0.00,
      "btw_percentage": 21,
      "btw_bedrag": 0.00,
      "bedrag_incl_btw": 0.00,
      "type": "inkomend|uitgaand",
      "btw_nummer": "NL...",
      "kvk_nummer": "...",
      "factuur_nummer": "..."
    }
  ]
}

Regels:
- "inkomend" = kosten die Babycrafts betaalt (inkoop, uitgaven)
- "uitgaand" = omzet die Babycrafts ontvangt (verkoop)
- BTW percentages in Nederland: 21%, 9%, of 0%
- Als datum onbekend is, gebruik dan de datum van vandaag
- Voor bankafschriften: maak een transactie per regel
- Bedragen altijd als positieve getallen
- Als BTW niet vermeld staat maar wel van toepassing is, bereken het zelf`

export async function processDocument(
  content: string | Buffer,
  mimeType: string,
  filename: string
): Promise<ProcessingResult> {
  try {
    let message

    if (mimeType.startsWith('image/')) {
      // Image: send as vision
      const base64 = Buffer.isBuffer(content)
        ? content.toString('base64')
        : Buffer.from(content).toString('base64')

      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Lees dit document uit en extraheer alle financiële informatie. Bestandsnaam: ${filename}`,
              },
            ],
          },
        ],
      })
    } else {
      // Text/PDF: send as text
      const textContent = Buffer.isBuffer(content) ? content.toString('utf-8') : content

      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Lees dit document uit en extraheer alle financiële informatie.\n\nBestandsnaam: ${filename}\n\nInhoud:\n${textContent}`,
          },
        ],
      })
    }

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Geen geldig JSON antwoord van Claude')
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Enrich transactions with kwartaal/jaar/maand
    const transactions: ExtractedTransaction[] = (parsed.transactions || []).map((t: ExtractedTransaction) => {
      const date = new Date(t.datum)
      return {
        ...t,
        kwartaal: getKwartaal(date),
        jaar: date.getFullYear(),
        maand: date.getMonth() + 1,
      }
    })

    return {
      success: true,
      transactions,
      raw_text: responseText,
      document_type: parsed.document_type || 'overig',
    }
  } catch (error) {
    return {
      success: false,
      transactions: [],
      raw_text: '',
      document_type: 'overig',
      error: error instanceof Error ? error.message : 'Onbekende fout',
    }
  }
}

// Direct ING CSV parser — no Claude needed, format is well-defined
export async function processINGCSV(csvContent: string): Promise<ProcessingResult> {
  try {
    const lines = csvContent.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) throw new Error('CSV te kort of leeg')

    // Detect separator (semicolon or comma)
    const sep = lines[0].includes(';') ? ';' : ','

    // Parse header to find column indices
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
    const col = (names: string[]) => names.reduce((found, n) => found >= 0 ? found : headers.findIndex(h => h.includes(n)), -1)

    const datumIdx   = col(['datum', 'date'])
    const naamIdx    = col(['naam', 'name', 'omschrijving'])
    const afbijIdx   = col(['af bij', 'af/bij', 'debet/credit', 'dc'])
    const bedragIdx  = col(['bedrag', 'amount'])
    const medIdx     = col(['mededeling', 'omschrijving', 'description', 'memo'])

    const transactions: ExtractedTransaction[] = []

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i]
      if (!raw.trim()) continue

      // Split respecting quoted fields
      const cols = raw.split(sep).map(c => c.replace(/^"|"$/g, '').trim())

      const datumRaw = datumIdx >= 0 ? cols[datumIdx] : ''
      const naam     = naamIdx  >= 0 ? cols[naamIdx]  : 'Onbekend'
      const afbij    = afbijIdx >= 0 ? cols[afbijIdx] : ''
      const bedragRaw = bedragIdx >= 0 ? cols[bedragIdx] : '0'
      const med      = medIdx >= 0 && medIdx !== naamIdx ? cols[medIdx] : ''

      // Parse datum: YYYYMMDD or DD-MM-YYYY or YYYY-MM-DD
      let datum = ''
      if (/^\d{8}$/.test(datumRaw)) {
        datum = `${datumRaw.slice(0,4)}-${datumRaw.slice(4,6)}-${datumRaw.slice(6,8)}`
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(datumRaw)) {
        const [d, m, y] = datumRaw.split('-')
        datum = `${y}-${m}-${d}`
      } else {
        datum = datumRaw || new Date().toISOString().slice(0,10)
      }

      // Parse amount: replace comma decimal separator
      const bedragNum = parseFloat(bedragRaw.replace(/\./g, '').replace(',', '.')) || 0
      if (bedragNum === 0) continue

      // Determine direction
      const isAf = afbij.toLowerCase().includes('af') || afbij.toLowerCase() === 'd' || afbij.toLowerCase() === 'debet'
      const type: 'inkomend' | 'uitgaand' = isAf ? 'inkomend' : 'uitgaand'

      // BTW: for bank statements we record as 0% (BTW is on the invoice, not the payment)
      const bedrag_incl_btw = bedragNum
      const btw_percentage = 0
      const btw_bedrag = 0
      const bedrag_excl_btw = bedragNum

      // Categorie guess
      const omschrijving = `${naam} ${med}`.toLowerCase()
      let categorie = 'Overig'
      if (omschrijving.includes('postnl') || omschrijving.includes('dhl') || omschrijving.includes('transport') || omschrijving.includes('verzend')) categorie = 'Transport & Logistiek'
      else if (omschrijving.includes('huur') || omschrijving.includes('rent')) categorie = 'Huur & Huisvesting'
      else if (omschrijving.includes('inkoop') || omschrijving.includes('leverancier') || omschrijving.includes('aliexpress') || omschrijving.includes('amazon')) categorie = 'Inkoop goederen'
      else if (omschrijving.includes('google') || omschrijving.includes('facebook') || omschrijving.includes('meta') || omschrijving.includes('advertent')) categorie = 'Marketing & Reclame'
      else if (omschrijving.includes('software') || omschrijving.includes('subscri') || omschrijving.includes('abonnement')) categorie = 'Software & Abonnementen'
      else if (omschrijving.includes('telefoon') || omschrijving.includes('odido') || omschrijving.includes('kpn') || omschrijving.includes('t-mobile') || omschrijving.includes('internet')) categorie = 'Telefoon & Internet'
      else if (omschrijving.includes('boekhou') || omschrijving.includes('accountant') || omschrijving.includes('administratie')) categorie = 'Accountant & Advies'
      else if (omschrijving.includes('verzekering') || omschrijving.includes('insurance')) categorie = 'Verzekering'
      else if (omschrijving.includes('eten') || omschrijving.includes('restaurant') || omschrijving.includes('cafe')) categorie = 'Zakelijk eten & drinken'
      else if (type === 'uitgaand') categorie = 'Verkoop goederen'

      const date = new Date(datum)
      transactions.push({
        datum,
        leverancier: naam,
        beschrijving: med || naam,
        categorie,
        bedrag_excl_btw,
        btw_percentage,
        btw_bedrag,
        bedrag_incl_btw,
        type,
        kwartaal: getKwartaal(date),
        jaar: date.getFullYear(),
        maand: date.getMonth() + 1,
      })
    }

    return {
      success: true,
      transactions,
      raw_text: `ING CSV: ${transactions.length} transacties verwerkt`,
      document_type: 'bankafschrift',
    }
  } catch (error) {
    return {
      success: false,
      transactions: [],
      raw_text: '',
      document_type: 'bankafschrift',
      error: error instanceof Error ? error.message : 'Onbekende fout',
    }
  }
}
