'use client'

import { useEffect, useState } from 'react'
import { Document } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FileText, Mail, Upload, Camera, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'

const sourceIcons = {
  email: Mail,
  upload: Upload,
  camera: Camera,
  ing_csv: FileText,
}

const statusConfig = {
  processed: { icon: CheckCircle, color: 'text-green-500', label: 'Verwerkt' },
  pending: { icon: Clock, color: 'text-orange-400', label: 'In behandeling' },
  error: { icon: AlertCircle, color: 'text-red-500', label: 'Fout' },
  flagged: { icon: AlertCircle, color: 'text-yellow-500', label: 'Handmatig controleren' },
}

export default function RecentDocuments() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/data/documents?status=all')
      const json = await res.json()
      const all: Document[] = json.documents || []
      setDocs(all.slice(0, 8))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="h-64 bg-white rounded-xl border border-gray-200 animate-pulse" />

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Recente Documenten</h2>
        <Link href="/dashboard/documenten" className="text-sm text-blue-600 hover:underline">
          Alle documenten →
        </Link>
      </div>

      {docs.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">Nog geen documenten. Upload je eerste factuur!</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const SourceIcon = sourceIcons[doc.source] || FileText
            const status = statusConfig[doc.status] || statusConfig.pending
            const StatusIcon = status.icon

            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                  <SourceIcon className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.original_filename}</p>
                  <p className="text-xs text-gray-400">{formatDate(doc.created_at)} · {doc.file_type}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusIcon className={`w-4 h-4 ${status.color}`} />
                  <span className={`text-xs ${status.color}`}>{status.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
