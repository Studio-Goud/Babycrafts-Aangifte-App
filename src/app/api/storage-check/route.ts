import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const diag = {
    supabase_url_set: !!supabaseUrl,
    supabase_url_value: supabaseUrl ? supabaseUrl.substring(0, 40) + '...' : 'MISSING',
    service_key_set: !!serviceKey,
    service_key_length: serviceKey?.length ?? 0,
    service_key_prefix: serviceKey ? serviceKey.substring(0, 20) + '...' : 'MISSING',
    anon_key_set: !!anonKey,
    anon_key_length: anonKey?.length ?? 0,
  }

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars', diag })
  }

  // Try storage directly via fetch (no SDK, raw HTTP)
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    })
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return NextResponse.json({ diag, storage_status: res.status, storage_response: body })
  } catch (err) {
    return NextResponse.json({ diag, fetch_error: err instanceof Error ? err.message : String(err) })
  }
}
