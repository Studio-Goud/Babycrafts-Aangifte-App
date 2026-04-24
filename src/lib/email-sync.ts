import { ImapFlow } from 'imapflow'
import { createServiceClient } from './supabase/server'
import { processDocument } from './claude-processor'

function isPDFOrImage(filename: string, contentType: string): boolean {
  const name = (filename || '').toLowerCase()
  const type = (contentType || '').toLowerCase()
  return (
    name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
    name.endsWith('.png') || type.includes('pdf') ||
    (type.includes('image/') && !type.includes('gif'))
  )
}

// Recursively find all PDF/image parts in MIME tree, return their part numbers
function findAttachmentParts(
  node: any,
  prefix = ''
): Array<{ part: string; filename: string; contentType: string }> {
  if (!node) return []

  const results: Array<{ part: string; filename: string; contentType: string }> = []

  // Multipart container — recurse into children
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

      let maxUid = lastUid

      // Single pass: fetch envelope + bodyStructure + source together
      // We limit source to avoid memory issues — only fetch if bodyStructure shows attachments
      const messages = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,  // fetch full source so we can extract attachments inline
      })

      for await (const msg of messages) {
        const subject = msg.envelope?.subject || '(geen onderwerp)'
        const from = msg.envelope?.from?.[0]?.address || ''
        const fingerprint = `${from}|${subject}`

        if (!options.force && processed.has(fingerprint)) {
          if (msg.uid > maxUid) maxUid = msg.uid
          continue
        }

        // Find attachment parts from structure
        const attachmentParts = findAttachmentParts(msg.bodyStructure)
        if (attachmentParts.length === 0) {
          if (msg.uid > maxUid) maxUid = msg.uid
          continue
        }

        emails_found++

        // Extract attachments from raw source using MIME boundary parsing
        const rawSource = msg.source?.toString() || ''
        const extracted = extractFromRawMIME(rawSource, attachmentParts)

        for (const att of extracted) {
          if (!att.data || att.data.length < 500) continue

          const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
          const storageKey = `email_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeFilename}`

          const { error: uploadErr } = await supabase.storage
            .from('documents')
            .upload(storageKey, att.data, { contentType: att.contentType })

          if (uploadErr) continue

          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storageKey)

          const { data: doc, error: docErr } = await supabase
            .from('documents')
            .insert({
              filename: storageKey,
              original_filename: att.filename,
              file_url: urlData?.publicUrl,
              file_type: 'factuur',
              source: 'email',
              source_email: from,
              source_subject: subject,
              status: 'pending',
            })
            .select().single()

          if (docErr || !doc) continue

          processed.add(fingerprint)

          const result = await processDocument(att.data, att.contentType, att.filename)

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
            // Still count as created — user can review/reprocess
            documents_created++
          }
        }

        if (msg.uid > maxUid) maxUid = msg.uid
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

// Extract attachments from raw MIME source by finding all base64 encoded parts
function extractFromRawMIME(
  raw: string,
  expectedParts: Array<{ part: string; filename: string; contentType: string }>
): Array<{ filename: string; contentType: string; data: Buffer }> {
  const results: Array<{ filename: string; contentType: string; data: Buffer }> = []

  // Find all boundaries in the email
  const boundaries: string[] = []
  const boundaryRe = /boundary="?([^"\r\n;>]+)"?/gi
  let m
  while ((m = boundaryRe.exec(raw)) !== null) {
    const b = m[1].trim()
    if (!boundaries.includes(b)) boundaries.push(b)
  }

  // For each expected attachment, try to find and extract it
  for (const expected of expectedParts) {
    let found = false

    // Try to find the part by content-type + filename in MIME parts
    for (const boundary of boundaries) {
      const parts = raw.split(`--${boundary}`)
      for (const part of parts) {
        if (part.trim() === '--' || part.trim() === '') continue

        const ctMatch = part.match(/Content-Type:\s*([^\r\n;]+)/i)
        if (!ctMatch) continue
        const ct = ctMatch[1].trim().toLowerCase()

        // Match by content type
        const expectedCt = expected.contentType.toLowerCase()
        const ctMatches = ct.includes('pdf') && expectedCt.includes('pdf') ||
          ct.includes('image') && expectedCt.includes('image') ||
          ct === expectedCt

        if (!ctMatches) continue

        // Find base64 content
        const encMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
        const encoding = encMatch?.[1]?.trim().toLowerCase() || ''

        const bodyStart = part.indexOf('\r\n\r\n')
        if (bodyStart === -1) continue

        const rawBody = part.substring(bodyStart + 4)
        const cleanBody = rawBody.replace(/--[^\r\n]*(--)?[\r\n]*/g, '').trim()

        try {
          let data: Buffer
          if (encoding === 'base64') {
            data = Buffer.from(cleanBody.replace(/\s/g, ''), 'base64')
          } else if (encoding === 'quoted-printable') {
            data = Buffer.from(decodeQP(cleanBody))
          } else {
            data = Buffer.from(cleanBody)
          }

          if (data.length < 100) continue

          // Get actual filename from part headers
          const fnMatch = part.match(/filename\*?=(?:UTF-8'')?["']?([^"'\r\n;]+)["']?/i)
          const filename = fnMatch ? decodeURIComponent(fnMatch[1].trim()) : expected.filename

          results.push({ filename, contentType: expected.contentType, data })
          found = true
          break
        } catch { continue }
      }
      if (found) break
    }
  }

  return results
}

function decodeQP(str: string): string {
  return str
    .replace(/=\r\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}
