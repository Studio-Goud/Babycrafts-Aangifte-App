import { ImapFlow } from 'imapflow'
import { createServiceClient } from './supabase/server'
import { processDocument } from './claude-processor'

const BUCKET = 'Documents'

function isPDFOrImage(filename: string, contentType: string): boolean {
  const name = (filename || '').toLowerCase()
  const type = (contentType || '').toLowerCase()
  return (
    name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
    name.endsWith('.png') || type.includes('pdf') ||
    (type.includes('image/') && !type.includes('gif'))
  )
}

function findAttachmentParts(
  node: any,
  prefix = ''
): Array<{ part: string; filename: string; contentType: string }> {
  if (!node) return []
  const results: Array<{ part: string; filename: string; contentType: string }> = []

  if (Array.isArray(node.childNodes) && node.childNodes.length > 0) {
    node.childNodes.forEach((child: any, i: number) => {
      const childPart = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      results.push(...findAttachmentParts(child, childPart))
    })
    return results
  }

  const partNum = prefix || '1'
  const contentType = `${node.type || 'application'}/${node.subtype || 'octet-stream'}`
  const filename =
    node.disposition?.params?.filename ||
    node.disposition?.params?.['filename*'] ||
    node.parameters?.name ||
    node.parameters?.['name*'] ||
    ''

  if (isPDFOrImage(filename, contentType)) {
    results.push({
      part: partNum,
      filename: filename || `bijlage_${partNum}.${node.subtype || 'pdf'}`,
      contentType,
    })
  }
  return results
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

interface SyncOptions {
  from?: string
  to?: string
  force?: boolean
}

async function ensureBucket(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const existing = (buckets || []).find((b: { name: string; public: boolean }) => b.name === BUCKET)
  if (!existing) {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 52428800 })
  } else if (!existing.public) {
    await supabase.storage.updateBucket(BUCKET, { public: true })
  }
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

  await ensureBucket(supabase)

  const { data: settings } = await supabase
    .from('settings').select('value').eq('key', 'last_email_uid').single()
  const lastUid = parseInt(settings?.value || '0')

  const client = new ImapFlow({
    host: process.env.EMAIL_IMAP_HOST || 'imap.one.com',
    port: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
    secure: true,
    auth: { user: process.env.EMAIL_USER!, pass: process.env.EMAIL_PASSWORD! },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Build duplicate set
      const processed = new Set<string>()
      if (!options.force) {
        const { data: existingDocs } = await supabase
          .from('documents').select('source_subject, source_email').eq('source', 'email').limit(2000)
        ;(existingDocs || []).forEach((d: { source_email: string; source_subject: string }) => {
          processed.add(`${d.source_email}|${d.source_subject}`)
        })
      }

      // Build search criteria
      let searchCriteria: Record<string, unknown>
      if (isPeriodSync) {
        const fromDate = options.from ? new Date(options.from) : new Date('2024-01-01')
        const toDate = options.to ? new Date(options.to + 'T23:59:59') : new Date()
        searchCriteria = { since: fromDate, before: toDate }
      } else if (lastUid > 0) {
        searchCriteria = { uid: `${lastUid + 1}:*` }
      } else {
        searchCriteria = { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }

      // Pass 1: collect messages with attachments (no source needed)
      type MsgInfo = {
        uid: number
        subject: string
        from: string
        parts: Array<{ part: string; filename: string; contentType: string }>
      }
      const toProcess: MsgInfo[] = []
      let maxUid = lastUid

      const messages = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        bodyStructure: true,
      })

      for await (const msg of messages) {
        if (msg.uid > maxUid) maxUid = msg.uid
        const subject = msg.envelope?.subject || '(geen onderwerp)'
        const from = msg.envelope?.from?.[0]?.address || ''
        const fingerprint = `${from}|${subject}`
        if (!options.force && processed.has(fingerprint)) continue

        const parts = findAttachmentParts(msg.bodyStructure)
        if (parts.length === 0) continue

        emails_found++
        toProcess.push({ uid: msg.uid, subject, from, parts })
      }

      // Pass 2: download and process each attachment
      for (const msgInfo of toProcess) {
        let docCreatedForEmail = false

        for (const partInfo of msgInfo.parts) {
          try {
            // Use ImapFlow's native download — handles all encoding transparently
            const dl = await client.download(msgInfo.uid.toString(), partInfo.part, { uid: true })
            if (!dl || !dl.content) continue

            const data = await streamToBuffer(dl.content)
            if (data.length < 500) continue

            const safeFilename = partInfo.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
            const storageKey = `email_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeFilename}`

            const { error: uploadErr } = await supabase.storage
              .from(BUCKET)
              .upload(storageKey, data, { contentType: partInfo.contentType })

            if (uploadErr) continue

            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storageKey)

            const { data: doc, error: docErr } = await supabase
              .from('documents')
              .insert({
                filename: storageKey,
                original_filename: partInfo.filename,
                file_url: urlData?.publicUrl,
                file_type: 'factuur',
                source: 'email',
                source_email: msgInfo.from,
                source_subject: msgInfo.subject,
                status: 'pending',
              })
              .select().single()

            if (docErr || !doc) continue

            processed.add(`${msgInfo.from}|${msgInfo.subject}`)

            const result = await processDocument(data, partInfo.contentType, partInfo.filename)

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
            } else {
              await supabase.from('documents').update({
                status: result.success ? 'flagged' : 'error',
                processing_error: result.error,
                raw_text: result.raw_text,
              }).eq('id', doc.id)
            }

            if (!docCreatedForEmail) {
              documents_created++
              docCreatedForEmail = true
            }
          } catch { continue }
        }
      }

      if (!isPeriodSync && maxUid > lastUid) {
        await supabase.from('settings')
          .update({ value: maxUid.toString(), updated_at: new Date().toISOString() })
          .eq('key', 'last_email_uid')
      }

    } finally {
      lock.release()
    }

    await client.logout()
    await supabase.from('email_sync_log').insert({ emails_found, documents_created, status: 'success' })
    return { emails_found, documents_created }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Onbekende fout'
    await supabase.from('email_sync_log').insert({
      emails_found, documents_created, status: 'error', error_message: errorMsg,
    }).catch(() => {})
    return { emails_found, documents_created, error: errorMsg }
  }
}
