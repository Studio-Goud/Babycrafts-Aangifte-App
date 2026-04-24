'use client'

import { useState, useEffect } from 'react'
import { EmailSyncLog } from '@/lib/types'
import { Mail, RefreshCw, CheckCircle, AlertCircle, Calendar } from 'lucide-react'

type SyncResult = {
  emails_found: number
  documents_created: number
  error?: string
}

const QUICK_PERIODS = [
  { label: 'Afgelopen 7 dagen', days: 7 },
  { label: 'Afgelopen 30 dagen', days: 30 },
  { label: 'Q1 2025 (jan–mrt)', from: '2025-01-01', to: '2025-03-31' },
  { label: 'Q2 2025 (apr–jun)', from: '2025-04-01', to: '2025-06-30' },
  { label: 'Q3 2025 (jul–sep)', from: '2025-07-01', to: '2025-09-30' },
  { label: 'Q4 2025 (okt–dec)', from: '2025-10-01', to: '2025-12-31' },
  { label: 'Heel 2025', from: '2025-01-01', to: '2025-12-31' },
  { label: 'Heel 2024', from: '2024-01-01', to: '2024-12-31' },
]

export default function EmailSyncPage() {
  const [syncing, setSyncing] = useState(false)
  const [logs, setLogs] = useState<EmailSyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [syncMode, setSyncMode] = useState<'auto' | 'period'>('auto')
  const [selectedPeriod, setSelectedPeriod] = useState(QUICK_PERIODS[0])
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  async function loadLogs() {
    const res = await fetch('/api/data/email-logs')
    const json = await res.json()
    setLogs(json.logs || [])
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [])

  const syncNow = async () => {
    setSyncing(true)
    setLastResult(null)
    setStatusMsg('Verbinding maken met One.com...')

    try {
      const body: Record<string, string> = {}

      if (syncMode === 'period') {
        if (useCustom) {
          body.from = customFrom
          body.to = customTo
        } else {
          if ('days' in selectedPeriod && selectedPeriod.days !== undefined) {
            const from = new Date()
            from.setDate(from.getDate() - selectedPeriod.days)
            body.from = from.toISOString().split('T')[0]
          } else {
            body.from = selectedPeriod.from!
            body.to = selectedPeriod.to!
          }
        }
        body.force = 'true' // ignore duplicate check for historical sync
      }

      setStatusMsg('Inbox scannen op facturen...')
      const res = await fetch('/api/email-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setLastResult(data)
      setStatusMsg('')
      await loadLogs()
    } catch {
      setLastResult({ emails_found: 0, documents_created: 0, error: 'Verbinding mislukt' })
      setStatusMsg('')
    }
    setSyncing(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Sync</h1>
        <p className="text-gray-500 mt-1">Automatisch facturen ophalen uit je One.com inbox</p>
      </div>

      {/* Config info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Mail className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900">One.com IMAP — imap.one.com:993</p>
          <p className="text-xs text-blue-600 mt-1">
            Scant op emails met factuur-bijlagen (PDF, afbeeldingen). Email en wachtwoord instellen via{' '}
            <a href="/dashboard/instellingen" className="underline">Instellingen</a>.
          </p>
        </div>
      </div>

      {/* Sync options */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <p className="text-sm font-semibold text-gray-900 mb-4">Synchroniseren</p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setSyncMode('auto')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              syncMode === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Nieuwe emails
          </button>
          <button
            onClick={() => setSyncMode('period')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              syncMode === 'period' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Periode kiezen
          </button>
        </div>

        {syncMode === 'auto' && (
          <p className="text-xs text-gray-500 mb-4">
            Haalt alle nieuwe emails op sinds de laatste sync. Duplicaten worden automatisch overgeslagen.
          </p>
        )}

        {syncMode === 'period' && (
          <div className="mb-5 space-y-3">
            <p className="text-xs text-gray-500">
              Kies een periode voor een <strong>volledige historische sync</strong>. Handig voor Q1, Q2 etc.
            </p>

            {/* Quick select */}
            {!useCustom && (
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PERIODS.map((period) => (
                  <button
                    key={period.label}
                    onClick={() => setSelectedPeriod(period)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                      selectedPeriod.label === period.label
                        ? 'bg-blue-50 border-2 border-blue-400 text-blue-700'
                        : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom range */}
            <button
              onClick={() => setUseCustom(!useCustom)}
              className="text-xs text-blue-600 underline"
            >
              {useCustom ? '← Terug naar snelkeuze' : 'Eigen periode invoeren'}
            </button>

            {useCustom && (
              <div className="flex gap-3 items-center">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Van</label>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tot</label>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
              <strong>Let op:</strong> Bij een periode-sync worden alle emails in die periode opgehaald,
              ook als ze al eerder zijn ingeboekt. Controleer achteraf op duplicaten.
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={syncNow}
            disabled={syncing || (syncMode === 'period' && useCustom && (!customFrom || !customTo))}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Bezig...' : syncMode === 'period' ? `Sync ${useCustom ? 'eigen periode' : selectedPeriod.label}` : 'Sync nieuwe emails'}
          </button>
          {syncing && statusMsg && (
            <p className="text-xs text-gray-500 animate-pulse">{statusMsg}</p>
          )}
        </div>

        {lastResult && (
          <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
            lastResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {lastResult.error
              ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              : <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>
              {lastResult.error
                ? <p className="text-sm font-medium">Fout: {lastResult.error}</p>
                : <>
                    <p className="text-sm font-medium">
                      {lastResult.documents_created} facturen ingeboekt
                    </p>
                    <p className="text-xs mt-0.5 opacity-80">
                      {lastResult.emails_found} emails gevonden
                    </p>
                  </>
              }
            </div>
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
                        ? `${log.emails_found} emails gescand, ${log.documents_created} ingeboekt`
                        : log.error_message}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 shrink-0">
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
