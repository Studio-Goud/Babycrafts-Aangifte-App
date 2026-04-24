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
      "categorie": "een van: Omzet|Inkoop goederen|Verzending & Verpakking|Kantoorkosten|Marketing & Reclame|Software & Abonnementen|Telefoonkosten|Verzekering|Accountant & Advies|Huur & Huisvesting|Personeelskosten|Interne overboeking|Overig",
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
- PostNL/DHL/verzendkosten → categorie "Verzending & Verpakking"
- Telefoon/internet/Odido/KPN → categorie "Telefoonkosten"
- Verkoop/omzet → categorie "Omzet", type "uitgaand"
- Bedragen altijd als positieve getallen
- Als BTW niet vermeld staat maar wel van toepassing is, bereken het zelf
- Overschrijving tussen eigen rekeningen (spaar↔betaal) → categorie "Interne overboeking", btw_percentage 0`

export async function processDocument(
  content: string | Buffer,
  mimeType: string,
  filename: string
): Promise<ProcessingResult> {
  try {
    let message

    if (mimeType.startsWith('image/')) {
      const base64 = Buffer.isBuffer(content)
        ? content.toString('base64')
        : Buffer.from(content).toString('base64')

      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
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
            { type: 'text', text: `Lees dit document uit. Bestandsnaam: ${filename}` },
          ],
        }],
      })
    } else if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      // Use Claude's native PDF support — no pdf-parse needed, avoids DOMMatrix error
      const base64 = Buffer.isBuffer(content)
        ? content.toString('base64')
        : Buffer.from(content as string, 'binary').toString('base64')

      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            } as never,
            { type: 'text', text: `Lees dit document uit. Bestandsnaam: ${filename}` },
          ],
        }],
      })
    } else {
      const textContent = Buffer.isBuffer(content) ? content.toString('utf-8') : content

      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Lees dit document uit.\n\nBestandsnaam: ${filename}\n\nInhoud:\n${textContent}`,
        }],
      })
    }

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Geen geldig JSON antwoord van Claude')

    const parsed = JSON.parse(jsonMatch[0])
    const transactions: ExtractedTransaction[] = (parsed.transactions || []).map((t: ExtractedTransaction) => {
      const date = new Date(t.datum)
      return { ...t, kwartaal: getKwartaal(date), jaar: date.getFullYear(), maand: date.getMonth() + 1 }
    })

    return { success: true, transactions, raw_text: responseText, document_type: parsed.document_type || 'overig' }
  } catch (error) {
    return { success: false, transactions: [], raw_text: '', document_type: 'overig', error: error instanceof Error ? error.message : 'Onbekende fout' }
  }
}

// Direct ING CSV parser — no Claude needed
export async function processINGCSV(csvContent: string): Promise<ProcessingResult> {
  try {
    const lines = csvContent.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) throw new Error('CSV te kort of leeg')

    const sep = lines[0].includes(';') ? ';' : ','
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
    const col = (names: string[]) => names.reduce((found, n) => found >= 0 ? found : headers.findIndex(h => h.includes(n)), -1)

    const datumIdx  = col(['datum', 'date'])
    const naamIdx   = col(['naam', 'name', 'omschrijving'])
    const afbijIdx  = col(['af bij', 'af/bij', 'debet/credit', 'dc'])
    const bedragIdx = col(['bedrag', 'amount'])
    const medIdx    = col(['mededeling', 'omschrijving', 'description', 'memo'])

    const transactions: ExtractedTransaction[] = []

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i]
      if (!raw.trim()) continue
      const cols = raw.split(sep).map(c => c.replace(/^"|"$/g, '').trim())

      const datumRaw  = datumIdx  >= 0 ? cols[datumIdx]  : ''
      const naam      = naamIdx   >= 0 ? cols[naamIdx]   : 'Onbekend'
      const afbij     = afbijIdx  >= 0 ? cols[afbijIdx]  : ''
      const bedragRaw = bedragIdx >= 0 ? cols[bedragIdx] : '0'
      const med       = medIdx >= 0 && medIdx !== naamIdx ? cols[medIdx] : ''

      let datum = ''
      if (/^\d{8}$/.test(datumRaw)) {
        datum = `${datumRaw.slice(0,4)}-${datumRaw.slice(4,6)}-${datumRaw.slice(6,8)}`
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(datumRaw)) {
        const [d, m, y] = datumRaw.split('-')
        datum = `${y}-${m}-${d}`
      } else {
        datum = datumRaw || new Date().toISOString().slice(0,10)
      }

      const bedragNum = parseFloat(bedragRaw.replace(/\./g, '').replace(',', '.')) || 0
      if (bedragNum === 0) continue

      const isAf = afbij.toLowerCase().includes('af') || afbij.toLowerCase() === 'd' || afbij.toLowerCase() === 'debet'
      const type: 'inkomend' | 'uitgaand' = isAf ? 'inkomend' : 'uitgaand'

      const date = new Date(datum)
      transactions.push({
        datum, leverancier: naam, beschrijving: med || naam, categorie: '',
        bedrag_excl_btw: bedragNum, btw_percentage: 0, btw_bedrag: 0, bedrag_incl_btw: bedragNum,
        type, kwartaal: getKwartaal(date), jaar: date.getFullYear(), maand: date.getMonth() + 1,
      })
    }

    return { success: true, transactions, raw_text: `ING CSV: ${transactions.length} transacties`, document_type: 'bankafschrift' }
  } catch (error) {
    return { success: false, transactions: [], raw_text: '', document_type: 'bankafschrift', error: error instanceof Error ? error.message : 'Onbekende fout' }
  }
}
