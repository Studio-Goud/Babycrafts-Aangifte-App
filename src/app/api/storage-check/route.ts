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

    const docsBucket = (buckets || []).find((b: { name: string }) => b.name === 'Documents')

    // Make public if needed
    let updateResult = null
    if (docsBucket && !(docsBucket as { public: boolean }).public) {
      const { error } = await supabase.storage.updateBucket('Documents', { public: true })
      updateResult = error ? `update_error: ${error.message}` : 'updated_to_public'
    }

    // Refresh bucket list to confirm
    const { data: bucketsAfter } = await supabase.storage.listBuckets()
    const docsBucketAfter = (bucketsAfter || []).find((b: { name: string }) => b.name === 'Documents')

    // Test upload
    const testKey = `test/ping_${Date.now()}.txt`
    const { error: uploadErr } = await supabase.storage
      .from('Documents')
      .upload(testKey, Buffer.from('ping'), { contentType: 'text/plain' })

    if (uploadErr) {
      return NextResponse.json({ ok: false, step: 'test_upload', error: uploadErr.message })
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('Documents').getPublicUrl(testKey)

    // Clean up
    await supabase.storage.from('Documents').remove([testKey])

    // Test DB query
    const { count, error: dbErr } = await supabase.from('documents').select('*', { count: 'exact', head: true })

    return NextResponse.json({
      ok: true,
      bucket_public: (docsBucketAfter as { public?: boolean })?.public ?? false,
      update_result: updateResult,
      test_upload: 'success',
      test_url: urlData?.publicUrl,
      db_ok: !dbErr,
      db_documents_count: count,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
