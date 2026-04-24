import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'

export const maxDuration = 60

export async function GET() {
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
    const results: any[] = []

    try {
      // Fetch last 5 messages with bodyStructure + source
      const messages = client.fetch('1:*', {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })

      let count = 0
      for await (const msg of messages) {
        if (count >= 5) break
        count++

        const rawSource = msg.source?.toString() || ''
        // Extract first 2000 chars of source to see MIME structure
        const sourcePreview = rawSource.substring(0, 2000)

        // Find boundaries
        const boundaries: string[] = []
        const boundaryRe = /boundary="?([^"\r\n;>]+)"?/gi
        let m
        while ((m = boundaryRe.exec(rawSource)) !== null) {
          const b = m[1].trim()
          if (!boundaries.includes(b)) boundaries.push(b)
        }

        // Check Content-Type lines in source
        const ctLines = rawSource.match(/Content-Type:[^\r\n]+/gi) || []
        const encLines = rawSource.match(/Content-Transfer-Encoding:[^\r\n]+/gi) || []
        const dispLines = rawSource.match(/Content-Disposition:[^\r\n]+/gi) || []

        results.push({
          uid: msg.uid,
          subject: msg.envelope?.subject,
          from: msg.envelope?.from?.[0]?.address,
          bodyStructure: JSON.stringify(msg.bodyStructure, null, 2),
          sourceLength: rawSource.length,
          boundaries,
          contentTypeLines: ctLines.slice(0, 10),
          encodingLines: encLines.slice(0, 10),
          dispositionLines: dispLines.slice(0, 10),
          sourcePreview,
        })
      }
    } finally {
      lock.release()
    }

    await client.logout()
    return NextResponse.json({ count: results.length, emails: results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
