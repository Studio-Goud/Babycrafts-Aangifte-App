import { NextRequest, NextResponse } from 'next/server'
import { syncEmails } from '@/lib/email-sync'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const result = await syncEmails({
      from: body.from,
      to: body.to,
      force: body.force === 'true' || body.force === true,
    })
    return NextResponse.json({ success: !result.error, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync mislukt' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncEmails({})
    return NextResponse.json({ success: !result.error, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync mislukt' },
      { status: 500 }
    )
  }
}
