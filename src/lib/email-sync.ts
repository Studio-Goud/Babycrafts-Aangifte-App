import { ImapFlow } from 'imapflow'
import { createServiceClient } from './supabase/server'
import { processDocument } from './claude-processor'

function isPDFOrImage(filename: string, contentType: string): boolean {
  const name = (filename || '').toLowerCase()
  const type = (contentType || '').toLowerCase()
  return (
    name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
    name.endsWith('.png') || type.includes('pdf') ||
    (type.includes('image') && !type.includes('gif'))
  )
}

// Walk MIME bodyStructure tree to find all attachments/PDFs
function findAttachmentParts(structure: any, prefix = ''): Array<{ part: string; filename: string; contentType: string }> {
  const results: Array<{ part: string; filename: string; contentType: string }> = []
  if (!structure) return results

  const partNum = prefix || '1'

  if (structure.childNodes && structure.childNodes.length > 0) {
    structure.childNodes.forEach((child: any, i: number) => {
      const childPart = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      results.push(...findAttachmentParts(child, childPart))
    })
    return results
  }

  const contentType = (structure.type || '') + '/' + (structure.subtype || '')
  const disposition = structure.disposition?.value?.toLowerCase() || ''
  const filename =
    structure.disposition?.params?.filename ||
    structure.disposition?.params?.['filename*'] ||
    structure.parameters?.name ||
    structure.parameters?.['name*'] ||
    ''

  const isAttachment = disposition === 'attachment' || disposition === 'inline'
  const isPdf = contentType.includes('pdf')
  const isImage = contentType.startsWith('image/') && !contentType.includes('gif')

  if ((isAttachment || isPdf || isImage) && isPDFOrImage(filename, contentType)) {
    results.push({ part: partNum, filename: filename || `bijlage.${structure.subtype || 'pdf'}`, contentType })
  }

  return results
}

interface SyncOptions {
  from?: string
  to?: string
  force?: boolean
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
      // Duplicate fingerprints (only for incremental sync)
      const processed = new Set<string>()
      if (!options.force) {
        const { data: existingDocs } = await supabase
          .from('documents')
          .select('source_subject, source_email')
          .eq('source', 'email')
          .limit(2000)
        ;(existingDocs || []).forEach((d: { source_email: string; source_subject: string }) => {
          processed.add(`${d.source_email}|${d.source_subject}`)
        })
      }

      // Search criteria
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

      // Fetch envelopes + body structure (no raw source — more reliable)
      const messages = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        bodyStructure: true,
      })

      let maxUid = lastUid
      const toProcess: Array<{ uid: number; subject: string; from: string; parts: Array<{ part: string; filename: string; contentType: string }> }> = []

      // First pass: collect all messages that have PDF/image attachments
      for await (const msg of messages) {
        const subject = msg.envelope?.subject || '(geen onderwerp)'
        const from = msg.envelope?.from?.[0]?.address || ''

        const fingerprint = `${from}|${subject}`
        if (!options.force && processed.has(fingerprint)) continue

        const parts = findAttachmentParts(msg.bodyStructure)
        if (parts.length === 0) continue

        toProcess.push({ uid: msg.uid, subject, from, parts })
        if (msg.uid > maxUid) maxUid = msg.uid
      }

      emails_found = toProcess.length

      // Second pass: download attachments and process
      for (const item of toProcess) {
        for (const partInfo of item.parts) {
          // Download the specific MIME part
          let partData: Buffer
          try {
            const chunks: Buffer[] = []
            const stream = await client.download(`${item.uid}`, partInfo.part, { uid: true })
            if (!stream) continue
            for await (const chunk of stream.content) {
              chunks.push(chunk as Buffer)
            }
            partData = Buffer.concat(chunks)
          } catch {
            continue
          }

          if (!partData || partData.length < 100) continue

          const storageFilename = `email_${Date.now()}_${partInfo.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storageFilename, partData, { contentType: partInfo.contentType })

          if (uploadError) continue

          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storageFilename)

          const { data: doc, error: docError } = await supabase
            .from('documents')
            .insert({
              filename: storageFilename,
              original_filename: partInfo.filename,
              file_url: urlData?.publicUrl,
              file_type: 'factuur',
              source: 'email',
              source_email: item.from,
              source_subject: item.subject,
              status: 'pending',
            })
            .select()
            .single()

          if (docError || !doc) continue

          processed.add(`${item.from}|${item.subject}`)

          // Process with Claude
          const result = await processDocument(partData, partInfo.contentType, partInfo.filename)

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

    await supabase.from('email_sync_log').insert({
      emails_found,
      documents_created,
      status: 'success',
    })

    return { emails_found, documents_created }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Onbekende fout'
    await supabase.from('email_sync_log').insert({
      emails_found, documents_created, status: 'error', error_message: errorMsg,
    }).catch(() => {})
    return { emails_found, documents_created, error: errorMsg }
  }
}
