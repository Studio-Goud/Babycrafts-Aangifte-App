import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  // Extract just the base URL (scheme + host)
  let baseUrl = supabaseUrl
  try {
    const u = new URL(supabaseUrl)
    baseUrl = `${u.protocol}//${u.host}`
  } catch {
    baseUrl = supabaseUrl
  }

  const diag = {
    raw_url_length: supabaseUrl.length,
    raw_url_first60: supabaseUrl.substring(0, 60),
    base_url: baseUrl,
    has_extra_path: supabaseUrl !== baseUrl,
    extra_path: supabaseUrl.replace(baseUrl, '') || '(none)',
    service_key_length: serviceKey.length,
    service_key_prefix: serviceKey.substring(0, 30),
  }

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars', diag })
  }

  // Always call storage on the base URL only
  try {
    const storageUrl = `${baseUrl}/storage/v1/bucket`
    const res = await fetch(storageUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    })
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return NextResponse.json({ diag, storage_url_used: storageUrl, storage_status: res.status, storage_response: body })
  } catch (err) {
    return NextResponse.json({ diag, fetch_error: err instanceof Error ? err.message : String(err) })
  }
}
