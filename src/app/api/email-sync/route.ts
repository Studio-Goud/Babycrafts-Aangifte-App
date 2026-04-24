import { NextRequest, NextResponse } from 'next/server'
import { syncEmails } from '@/lib/email-sync'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const result = await syncEmails()
    return NextResponse.json({
      success: !result.error,
      ...result,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync mislukt' },
      { status: 500 }
    )
  }
}

// Also allow GET for cron triggers (Vercel Cron)
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncEmails()
    return NextResponse.json({ success: !result.error, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync mislukt' },
      { status: 500 }
    )
  }
}
