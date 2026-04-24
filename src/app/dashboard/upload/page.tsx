import UploadZone from '@/components/UploadZone'

export default function UploadPage() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Documenten Uploaden</h1>
        <p className="text-gray-500 mt-1">Upload facturen, bonnen of ING bankafschriften. Claude verwerkt ze automatisch.</p>
      </div>
      <UploadZone />
    </div>
  )
}
