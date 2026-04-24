'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmailSyncLog } from '@/lib/types'
import { Mail, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react'

export default function EmailSyncPage() {
  const [syncing, setSyncing] = useState(false)
  const [logs, setLogs] = useState<EmailSyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [lastResult, setLastResult] = useState<{ emails_found: number; documents_created: number; error?: string } | null>(null)

  async function loadLogs() {
    const supabase = createClient()
    const { data } = await supabase
      .from('email_sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(20)
    setLogs(data || [])
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [])

  const syncNow = async () => {
    setSyncing(true)
    setLastResult(null)
    try {
      const res = await fetch('/api/email-sync', { method: 'POST' })
      const data = await res.json()
      setLastResult(data)
      await loadLogs()
    } catch (err) {
      setLastResult({ emails_found: 0, documents_created: 0, error: 'Verbinding mislukt' })
    }
    setSyncing(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Sync</h1>
        <p className="text-gray-500 mt-1">
          Automatisch facturen ophalen uit je One.com inbox
        </p>
      </div>

      {/* Config info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">One.com IMAP koppeling</p>
            <p className="text-sm text-blue-700 mt-1">
              Verbindt via IMAP met <strong>imap.one.com:993</strong>. Scant op emails met factuur-bijlagen (PDF, afbeeldingen).
              Configureer je emailadres en wachtwoord in de <a href="/dashboard/instellingen" className="underline">instellingen</a>.
            </p>
            <p className="text-xs text-blue-500 mt-2">
              Tip: maak een app-wachtwoord aan in je One.com account voor extra veiligheid.
            </p>
          </div>
        </div>
      </div>

      {/* Sync button */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Handmatig synchroniseren</p>
            <p className="text-xs text-gray-500 mt-1">
              De app synchroniseert ook automatisch elke 6 uur via Vercel Cron
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Bezig...' : 'Sync nu'}
          </button>
        </div>

        {lastResult && (
          <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
            lastResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {lastResult.error
              ? <AlertCircle className="w-4 h-4 shrink-0" />
              : <CheckCircle className="w-4 h-4 shrink-0" />}
            <p className="text-sm">
              {lastResult.error
                ? `Fout: ${lastResult.error}`
                : `${lastResult.emails_found} emails gevonden, ${lastResult.documents_created} documenten ingeboekt`}
            </p>
          </div>
        )}
      </div>

      {/* Sync history */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Sync Geschiedenis</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">Nog geen synchronisaties uitgevoerd</p>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const Icon = log.status === 'success' ? CheckCircle : AlertCircle
              const color = log.status === 'success' ? 'text-green-500' : 'text-red-500'
              const date = new Date(log.synced_at)
              return (
                <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-50 hover:bg-gray-50">
                  <Icon className={`w-4 h-4 ${color} shrink-0`} />
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">
                      {log.status === 'success'
                        ? `${log.emails_found} emails, ${log.documents_created} ingeboekt`
                        : log.error_message}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {date.toLocaleDateString('nl-NL')} {date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
