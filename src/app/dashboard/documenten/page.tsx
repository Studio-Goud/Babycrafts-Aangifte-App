'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Document, DocumentStatus } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FileText, Mail, Upload, Camera, AlertCircle, CheckCircle, Clock, ExternalLink, RefreshCw } from 'lucide-react'

const sourceLabels = { email: 'Email', upload: 'Upload', camera: 'Foto', ing_csv: 'ING CSV' }
const statusConfig: Record<DocumentStatus, { icon: typeof CheckCircle; color: string; label: string }> = {
  processed: { icon: CheckCircle, color: 'text-green-500', label: 'Verwerkt' },
  pending: { icon: Clock, color: 'text-orange-400', label: 'Wacht' },
  error: { icon: AlertCircle, color: 'text-red-500', label: 'Fout' },
  flagged: { icon: AlertCircle, color: 'text-yellow-500', label: 'Controleren' },
}

export default function DocumentenPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<DocumentStatus | 'all'>('all')
  const [reprocessing, setReprocessing] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    let query = supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    setDocs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  const reprocess = async (docId: string) => {
    setReprocessing(docId)
    await fetch(`/api/reprocess/${docId}`, { method: 'POST' })
    await load()
    setReprocessing(null)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documenten</h1>
          <p className="text-gray-500 mt-1">Alle geüploade en automatisch gevonden documenten</p>
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'processed', 'error', 'flagged'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                filter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'Alle' : statusConfig[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3" />
          <p>Geen documenten gevonden</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Bestand</th>
                <th className="px-4 py-3 font-medium">Bron</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Kwartaal</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map(doc => {
                const status = statusConfig[doc.status] || statusConfig.pending
                const StatusIcon = status.icon
                return (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-48">{doc.original_filename}</p>
                      {doc.source_subject && (
                        <p className="text-xs text-gray-400 truncate max-w-48">{doc.source_subject}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{sourceLabels[doc.source] || doc.source}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{doc.file_type}</td>
                    <td className="px-4 py-3 text-gray-500">{doc.kwartaal || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`w-4 h-4 ${status.color}`} />
                        <span className={`text-xs ${status.color}`}>{status.label}</span>
                      </div>
                      {doc.processing_error && (
                        <p className="text-xs text-red-400 mt-0.5 truncate max-w-32">{doc.processing_error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-500 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {(doc.status === 'error' || doc.status === 'flagged') && (
                          <button
                            onClick={() => reprocess(doc.id)}
                            disabled={reprocessing === doc.id}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="Opnieuw verwerken"
                          >
                            <RefreshCw className={`w-4 h-4 ${reprocessing === doc.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
