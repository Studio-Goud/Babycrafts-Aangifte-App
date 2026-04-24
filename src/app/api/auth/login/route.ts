import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = process.env.APP_PASSWORD || '2911'

  if (password !== correct) {
    return NextResponse.json({ error: 'Onjuiste code' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set('btw_session', correct, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 dagen
    path: '/',
  })
  return res
}
