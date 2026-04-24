import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

// Run once to add anon-access policies on all tables
export async function GET() {
  try {
    const supabase = createServiceClient()

    // Execute RLS policies via pg_policies using raw query through RPC
    // We use supabase-js to call a built-in pg function
    const statements = [
      // documents
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documents' AND policyname='anon_all_documents') THEN
          ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
          CREATE POLICY anon_all_documents ON documents FOR ALL TO anon USING (true) WITH CHECK (true);
        END IF;
      END $$`,
      // transactions
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transactions' AND policyname='anon_all_transactions') THEN
          ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
          CREATE POLICY anon_all_transactions ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);
        END IF;
      END $$`,
      // email_sync_log
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_sync_log' AND policyname='anon_all_email_sync_log') THEN
          ALTER TABLE email_sync_log ENABLE ROW LEVEL SECURITY;
          CREATE POLICY anon_all_email_sync_log ON email_sync_log FOR ALL TO anon USING (true) WITH CHECK (true);
        END IF;
      END $$`,
      // settings
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='anon_all_settings') THEN
          ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
          CREATE POLICY anon_all_settings ON settings FOR ALL TO anon USING (true) WITH CHECK (true);
        END IF;
      END $$`,
    ]

    const results = []
    for (const sql of statements) {
      const { error } = await supabase.rpc('exec_sql', { query: sql }).maybeSingle()
      results.push({ sql: sql.substring(0, 50), error: error?.message })
    }

    // Alternative: test if anon key can read by checking with service key
    const { count, error: countErr } = await supabase
      .from('documents').select('*', { count: 'exact', head: true })
    const { count: txCount } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true })

    return NextResponse.json({
      rpc_results: results,
      documents_count: count,
      transactions_count: txCount,
      db_error: countErr?.message,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) })
  }
}
