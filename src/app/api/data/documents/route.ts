import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { Document, DocumentStatus } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') || 'all'

  const supabase = createServiceClient()
  let query = supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    query = query.eq('status', status as DocumentStatus)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: (data || []) as Document[] })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is verplicht' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Get the document first for filename
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('filename')
    .eq('id', id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Delete associated transactions
  await supabase.from('transactions').delete().eq('document_id', id)

  // Delete from storage if file exists
  if (doc?.filename) {
    await supabase.storage.from('Documents').remove([doc.filename])
  }

  // Delete the document record
  const { error: deleteError } = await supabase.from('documents').delete().eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
