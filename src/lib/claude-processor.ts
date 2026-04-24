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

export async function processINGCSV(csvContent: string): Promise<ProcessingResult> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Dit is een ING bankafschrift in CSV formaat. Lees alle transacties uit en categoriseer ze.
Let op: bij ING CSV is het formaat: Datum;Naam/Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);MutatieSoort;Mededelingen

CSV inhoud:
${csvContent}`,
        },
      ],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Geen geldig JSON antwoord')

    const parsed = JSON.parse(jsonMatch[0])
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
