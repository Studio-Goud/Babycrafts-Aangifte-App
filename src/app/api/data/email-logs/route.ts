import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { EmailSyncLog } from '@/lib/types'

export async function GET() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('email_sync_log')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: (data || []) as EmailSyncLog[] })
}
