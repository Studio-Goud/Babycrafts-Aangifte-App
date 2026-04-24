'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, Eye, EyeOff } from 'lucide-react'

interface Setting { key: string; value: string }

const SETTINGS_LABELS: Record<string, { label: string; type: 'text' | 'password' | 'toggle'; description?: string }> = {
  bedrijfsnaam: { label: 'Bedrijfsnaam', type: 'text' },
  btw_nummer: { label: 'BTW-nummer', type: 'text', description: 'bijv. NL123456789B01' },
  kvk_nummer: { label: 'KVK-nummer', type: 'text' },
  email_sync_enabled: { label: 'Email sync ingeschakeld', type: 'toggle' },
  email_sync_interval_hours: { label: 'Sync interval (uren)', type: 'text' },
}

export default function InstellingenPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [emailUser, setEmailUser] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('settings').select('*')
      const map: Record<string, string> = {}
      ;(data || []).forEach((s: Setting) => { map[s.key] = s.value })
      setSettings(map)
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    const supabase = createClient()

    await Promise.all(
      Object.entries(settings).map(([key, value]) =>
        supabase.from('settings')
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      )
    )

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Instellingen</h1>
        <p className="text-gray-500 mt-1">Bedrijfsgegevens en email configuratie</p>
      </div>

      <div className="space-y-6">
        {/* Company settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Bedrijfsgegevens</h2>
          <div className="space-y-4">
            {['bedrijfsnaam', 'btw_nummer', 'kvk_nummer'].map(key => {
              const config = SETTINGS_LABELS[key]
              return (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {config.label}
                  </label>
                  {config.description && (
                    <p className="text-xs text-gray-400 mb-1">{config.description}</p>
                  )}
                  <input
                    type="text"
                    value={settings[key] || ''}
                    onChange={e => updateSetting(key, e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Email config */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Email Configuratie (One.com)</h2>
          <p className="text-xs text-gray-400 mb-4">
            Vul hieronder je One.com emailgegevens in. Deze worden opgeslagen als omgevingsvariabelen op Vercel.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
            <strong>Let op:</strong> Stel de volgende variabelen in via{' '}
            <a href="https://vercel.com/studio-gouds-projects/babycrafts-aangifte-app/settings/environment-variables"
              target="_blank" rel="noopener noreferrer" className="underline">
              Vercel Environment Variables
            </a>:
            <ul className="mt-2 space-y-1 font-mono">
              <li>EMAIL_USER = jouw@domein.com</li>
              <li>EMAIL_PASSWORD = jouwwachtwoord</li>
              <li>ANTHROPIC_API_KEY = sk-ant-...</li>
              <li>SUPABASE_SERVICE_ROLE_KEY = ...</li>
              <li>CRON_SECRET = willekeurige-string</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email sync</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateSetting('email_sync_enabled',
                    settings.email_sync_enabled === 'true' ? 'false' : 'true')}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.email_sync_enabled === 'true' ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.email_sync_enabled === 'true' ? 'translate-x-5' : ''
                  }`} />
                </button>
                <span className="text-sm text-gray-600">
                  {settings.email_sync_enabled === 'true' ? 'Ingeschakeld' : 'Uitgeschakeld'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Opgeslagen!' : saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
