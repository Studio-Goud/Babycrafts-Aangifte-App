import { ImapFlow } from 'imapflow'
import { createServiceClient } from './supabase/server'
import { processDocument } from './claude-processor'

const INVOICE_KEYWORDS = [
  'factuur', 'invoice', 'rekening', 'bon', 'nota', 'order',
  'betaling', 'payment', 'receipt', 'purchase', 'bestelling',
  'levering', 'credit', 'debet', 'declaration', 'postnl', 'dhl',
  'bol.com', 'zalando', 'coolblue', 'amazon', 'pakket', 'verzending'
]

function isLikelyInvoiceEmail(subject: string, from: string): boolean {
  const text = (subject + ' ' + from).toLowerCase()
  return INVOICE_KEYWORDS.some(kw => text.includes(kw))
}

function isPDFOrImage(filename: string, contentType: string): boolean {
  const name = filename.toLowerCase()
  const type = contentType.toLowerCase()
  return (
    name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
    name.endsWith('.png') || type.includes('pdf') || type.includes('image')
  )
}

interface SyncOptions {
  from?: string   // date string YYYY-MM-DD
  to?: string     // date string YYYY-MM-DD
  force?: boolean // skip duplicate check (for historical syncs)
}

export async function syncEmails(options: SyncOptions = {}): Promise<{
  emails_found: number
  documents_created: number
  error?: string
}> {
  const supabase = createServiceClient()
  let emails_found = 0
  let documents_created = 0
  const isPeriodSync = !!(options.from || options.to)

  // Get last processed UID (only used for incremental sync)
  const { data: settings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'last_email_uid')
    .single()
  const lastUid = parseInt(settings?.value || '0')

  const client = new ImapFlow({
    host: process.env.EMAIL_IMAP_HOST || 'imap.one.com',
    port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASSWORD!,
    },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Build duplicate fingerprint set (skip for force/period sync)
      const processed = new Set<string>()
      if (!options.force) {
        const { data: existingDocs } = await supabase
          .from('documents')
          .select('source_subject, source_email')
          .eq('source', 'email')
          .order('created_at', { ascending: false })
          .limit(1000)
        ;(existingDocs || []).forEach((d: { source_email: string; source_subject: string }) => {
          processed.add(`${d.source_email}|${d.source_subject}`)
        })
      }

      // Build IMAP search criteria
      let searchCriteria: Record<string, unknown>
      if (isPeriodSync) {
        // Period sync: use date range
        const fromDate = options.from ? new Date(options.from) : new Date('2024-01-01')
        const toDate = options.to ? new Date(options.to + 'T23:59:59') : new Date()
        searchCriteria = { since: fromDate, before: toDate }
      } else if (lastUid > 0) {
        // Incremental: only new emails
        searchCriteria = { uid: `${lastUid + 1}:*` }
      } else {
        // First run: last 30 days
        searchCriteria = { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }

      const messages = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })

      let maxUid = lastUid

      for await (const msg of messages) {
        const subject = msg.envelope?.subject || ''
        const from = msg.envelope?.from?.[0]?.address || ''

        if (!isLikelyInvoiceEmail(subject, from)) continue

        const fingerprint = `${from}|${subject}`
        if (!options.force && processed.has(fingerprint)) continue

        const source = msg.source?.toString() || ''
        const hasPDFAttachment =
          source.toLowerCase().includes('application/pdf') ||
          source.toLowerCase().includes('content-type: image/')

        if (!hasPDFAttachment) continue

        emails_found++
        const attachments = extractAttachmentsFromRaw(source)

        for (const attachment of attachments) {
          if (!isPDFOrImage(attachment.filename, attachment.contentType)) continue

          const storageFilename = `email_${Date.now()}_${attachment.filename}`
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storageFilename, attachment.data, { contentType: attachment.contentType })

          if (uploadError) continue

          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storageFilename)

          const { data: doc, error: docError } = await supabase
            .from('documents')
            .insert({
              filename: storageFilename,
              original_filename: attachment.filename,
              file_url: urlData?.publicUrl,
              file_type: 'factuur',
              source: 'email',
              source_email: from,
              source_subject: subject,
              status: 'pending',
            })
            .select()
            .single()

          if (docError || !doc) continue

          processed.add(fingerprint)

          const result = await processDocument(attachment.data, attachment.contentType, attachment.filename)

          if (result.success && result.transactions.length > 0) {
            await supabase.from('transactions').insert(
              result.transactions.map(t => ({ ...t, document_id: doc.id }))
            )
            await supabase.from('documents').update({
              status: 'processed',
              raw_text: result.raw_text,
              file_type: result.document_type as never,
              processed_at: new Date().toISOString(),
              kwartaal: result.transactions[0]?.kwartaal,
            }).eq('id', doc.id)
            documents_created++
          } else {
            await supabase.from('documents').update({
              status: result.success ? 'flagged' : 'error',
              processing_error: result.error,
              raw_text: result.raw_text,
            }).eq('id', doc.id)
          }
        }

        if (msg.uid && msg.uid > maxUid) maxUid = msg.uid
      }

      // Only update UID pointer for incremental syncs
      if (!isPeriodSync && maxUid > lastUid) {
        await supabase.from('settings')
          .update({ value: maxUid.toString(), updated_at: new Date().toISOString() })
          .eq('key', 'last_email_uid')
      }

    } finally {
      lock.release()
    }

    await client.logout()

    await supabase.from('email_sync_log').insert({
      emails_found,
      documents_created,
      status: 'success',
    })

    return { emails_found, documents_created }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Onbekende fout'
    await supabase.from('email_sync_log').insert({
      emails_found,
      documents_created,
      status: 'error',
      error_message: errorMsg,
    }).catch(() => {})
    return { emails_found, documents_created, error: errorMsg }
  }
}

function extractAttachmentsFromRaw(rawEmail: string): Array<{
  filename: string
  contentType: string
  data: Buffer
}> {
  const attachments: Array<{ filename: string; contentType: string; data: Buffer }> = []

  const boundaryMatch = rawEmail.match(/boundary="?([^"\r\n;]+)"?/i)
  if (!boundaryMatch) return attachments

  const boundary = boundaryMatch[1]
  const parts = rawEmail.split(`--${boundary}`)

  for (const part of parts) {
    const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n;]+)/i)
    const filenameMatch = part.match(/filename\*?="?([^"\r\n;]+)"?/i)
    const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)

    if (!contentTypeMatch || !filenameMatch) continue

    const contentType = contentTypeMatch[1].trim().toLowerCase()
    const filename = filenameMatch[1].trim().replace(/UTF-8''/, '')

    if (!isPDFOrImage(filename, contentType)) continue

    const contentStart = part.indexOf('\r\n\r\n')
    if (contentStart === -1) continue

    const b64Content = part.substring(contentStart + 4).replace(/\r\n/g, '').trim()
    const encoding = encodingMatch?.[1]?.trim().toLowerCase()

    try {
      const data = encoding === 'base64'
        ? Buffer.from(b64Content, 'base64')
        : Buffer.from(b64Content)
      attachments.push({ filename, contentType, data })
    } catch {}
  }

  return attachments
}
