'use client'

import { useCallback, useState, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Camera, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type FileStatus = 'waiting' | 'uploading' | 'processing' | 'done' | 'error'

interface FileItem {
  id: string
  file: File
  status: FileStatus
  error?: string
  transactionsFound?: number
}

export default function UploadZone() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const processFile = async (item: FileItem) => {
    setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f))

    const formData = new FormData()
    formData.append('file', item.file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Upload mislukt')

      setFiles(prev => prev.map(f =>
        f.id === item.id
          ? { ...f, status: 'done', transactionsFound: data.transactions_count }
          : f
      ))
    } catch (error) {
      setFiles(prev => prev.map(f =>
        f.id === item.id
          ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Fout' }
          : f
      ))
    }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newItems: FileItem[] = acceptedFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'waiting',
    }))

    setFiles(prev => [...prev, ...newItems])

    // Process sequentially
    for (const item of newItems) {
      await processFile(item)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'text/csv': ['.csv'],
    },
    multiple: true,
  })

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream
      setCameraActive(true)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 100)
    } catch {
      alert('Camera niet beschikbaar')
    }
  }

  const capturePhoto = async () => {
    if (!videoRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], `bon_${Date.now()}.jpg`, { type: 'image/jpeg' })
      stopCamera()

      const item: FileItem = { id: crypto.randomUUID(), file, status: 'waiting' }
      setFiles(prev => [...prev, item])
      await processFile(item)
    }, 'image/jpeg', 0.9)
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Camera view */}
      {cameraActive && (
        <div className="bg-black rounded-xl overflow-hidden relative">
          <video ref={videoRef} autoPlay playsInline className="w-full max-h-80 object-cover" />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <button
              onClick={capturePhoto}
              className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg"
            >
              <Camera className="w-6 h-6 text-gray-900" />
            </button>
            <button
              onClick={stopCamera}
              className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drag & Drop */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">Sleep bestanden hierheen</p>
          <p className="text-xs text-gray-400 mt-1">of klik om te bladeren</p>
          <p className="text-xs text-gray-300 mt-3">PDF, JPG, PNG, CSV</p>
        </div>

        {/* Camera */}
        <button
          onClick={startCamera}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 hover:bg-gray-50 transition-colors"
        >
          <Camera className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">Maak een foto</p>
          <p className="text-xs text-gray-400 mt-1">Bonnetje of factuur fotograferen</p>
        </button>
      </div>

      {/* ING CSV tip */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
        <strong>ING Bankafschrift:</strong> Exporteer vanuit ING als CSV (Mijn ING → Transacties → Exporteren) en upload hier.
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Bestanden</h3>
          {files.map((item) => (
            <FileRow key={item.id} item={item} onRemove={() => removeFile(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const statusConfig = {
    waiting: { icon: null, color: 'text-gray-400', label: 'Wachten...' },
    uploading: { icon: Loader2, color: 'text-blue-500 animate-spin', label: 'Uploaden...' },
    processing: { icon: Loader2, color: 'text-orange-500 animate-spin', label: 'Claude verwerkt...' },
    done: { icon: CheckCircle, color: 'text-green-500', label: `${item.transactionsFound || 0} transacties gevonden` },
    error: { icon: AlertCircle, color: 'text-red-500', label: item.error || 'Fout' },
  }

  const { icon: StatusIcon, color, label } = statusConfig[item.status]

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
      <span className="flex-1 text-sm text-gray-700 truncate">{item.file.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {StatusIcon && <StatusIcon className={`w-4 h-4 ${color}`} />}
        <span className={`text-xs ${color}`}>{label}</span>
      </div>
      {item.status !== 'uploading' && item.status !== 'processing' && (
        <button onClick={onRemove} className="ml-1 text-gray-300 hover:text-gray-500">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
