import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

export async function GET() {
  try {
    const supabase = createServiceClient()

    // List buckets
    const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets()
    if (bucketsErr) {
      return NextResponse.json({ step: 'list_buckets', error: bucketsErr.message })
    }

    const bucketNames = (buckets || []).map((b: { name: string }) => b.name)
    const hasDocuments = bucketNames.includes('documents')

    // Try creating bucket if missing
    if (!hasDocuments) {
      const { error: createErr } = await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 52428800,
      })
      if (createErr) {
        return NextResponse.json({ step: 'create_bucket', error: createErr.message, buckets: bucketNames })
      }
    }

    // Try uploading a small test file
    const testKey = `test/ping_${Date.now()}.txt`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(testKey, Buffer.from('ping'), { contentType: 'text/plain' })

    if (uploadErr) {
      return NextResponse.json({ step: 'test_upload', error: uploadErr.message, buckets: bucketNames, bucket_created: !hasDocuments })
    }

    // Clean up test file
    await supabase.storage.from('documents').remove([testKey])

    return NextResponse.json({
      ok: true,
      buckets: bucketNames,
      documents_bucket_existed: hasDocuments,
      test_upload: 'success',
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) })
  }
}
