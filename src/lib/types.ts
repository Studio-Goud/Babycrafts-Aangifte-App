export type DocumentType = 'factuur' | 'bon' | 'bankafschrift' | 'creditnota' | 'overig'
export type DocumentSource = 'upload' | 'email' | 'camera' | 'ing_csv'
export type DocumentStatus = 'pending' | 'processed' | 'error' | 'flagged'
export type TransactionType = 'inkomend' | 'uitgaand'

export interface Document {
  id: string
  created_at: string
  filename: string
  original_filename: string
  file_url?: string
  file_type: DocumentType
  source: DocumentSource
  source_email?: string
  source_subject?: string
  status: DocumentStatus
  raw_text?: string
  processing_error?: string
  kwartaal?: string
  processed_at?: string
}

export interface Transaction {
  id: string
  created_at: string
  document_id: string
  datum: string
  leverancier?: string
  beschrijving?: string
  categorie?: string
  bedrag_excl_btw: number
  btw_percentage?: number
  btw_bedrag?: number
  bedrag_incl_btw?: number
  type: TransactionType
  kvk_nummer?: string
  btw_nummer?: string
  factuur_nummer?: string
  kwartaal: string
  jaar: number
  maand: number
  verified: boolean
  document?: Document
}

export interface BTWSummary {
  kwartaal: string
  omzet_excl_btw: number
  btw_ontvangen: number
  kosten_excl_btw: number
  btw_betaald: number
  te_betalen_btw: number
  transacties_count: number
}

export interface EmailSyncLog {
  id: string
  created_at: string
  synced_at: string
  emails_found: number
  documents_created: number
  status: string
  error_message?: string
}

export const BTW_CATEGORIES = [
  'Inkoop goederen',
  'Verkoop goederen',
  'Kantoorkosten',
  'Transport & Logistiek',
  'Marketing & Reclame',
  'Software & Abonnementen',
  'Zakelijk eten & drinken',
  'Telefoon & Internet',
  'Verzekering',
  'Accountant & Advies',
  'Huur & Huisvesting',
  'Personeelskosten',
  'Overig',
] as const

export const KWARTALEN = ['Q1', 'Q2', 'Q3', 'Q4'] as const

export function getKwartaal(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3)
  return `${date.getFullYear()}-Q${q}`
}

export function getKwartaalRange(kwartaal: string): { start: Date; end: Date } {
  const [year, q] = kwartaal.split('-Q')
  const quarter = parseInt(q)
  const startMonth = (quarter - 1) * 3
  const start = new Date(parseInt(year), startMonth, 1)
  const end = new Date(parseInt(year), startMonth + 3, 0)
  return { start, end }
}
