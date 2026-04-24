import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

export async function GET() {
  try {
    const supabase = createServiceClient()

    // List buckets
    const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets()
    if (bucketsErr) {
      return NextResponse.json({ ok: false, step: 'list_buckets', error: bucketsErr.message })
    }

    const bucketInfo = (buckets || []).map((b: { name: string; public: boolean }) => ({ name: b.name, public: b.public }))
    const docsBucket = (buckets || []).find((b: { name: string }) => b.name === 'Documents')

    // Make public if needed
    if (docsBucket && !docsBucket.public) {
      await supabase.storage.updateBucket('Documents', { public: true })
    }

    // Test upload
    const testKey = `test/ping_${Date.now()}.txt`
    const { error: uploadErr } = await supabase.storage
      .from('Documents')
      .upload(testKey, Buffer.from('ping'), { contentType: 'text/plain' })

    if (uploadErr) {
      return NextResponse.json({ ok: false, step: 'test_upload', error: uploadErr.message, buckets: bucketInfo })
    }

    // Clean up
    await supabase.storage.from('Documents').remove([testKey])

    // Test DB query
    const { error: dbErr } = await supabase.from('documents').select('id').limit(1)

    return NextResponse.json({
      ok: true,
      buckets: bucketInfo,
      test_upload: 'success',
      db_ok: !dbErr,
      db_error: dbErr?.message,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
