import { useRef } from 'react'
import { Camera, X, AlertTriangle, FileText } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { compressPhoto, checkPhotoQuality } from '../../lib/photoUtils'
import { useTranslation } from '../../hooks/useTranslation'

// Stable empty array — avoids new reference on every render in Zustand selector
const EMPTY: string[] = []

interface Props {
  fieldId: string
  label: string
  required: boolean
}

export function PhotoField({ fieldId, label, required }: Props) {
  const { t } = useTranslation()
  const photos = useAppStore((s) => s.photos[fieldId] ?? EMPTY)
  const quality = useAppStore((s) => s.photoQuality[fieldId] ?? EMPTY)
  const addPhoto = useAppStore((s) => s.addPhoto)
  const removePhoto = useAppStore((s) => s.removePhoto)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        if (file.type === 'application/pdf') {
          const reader = new FileReader()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          addPhoto(fieldId, dataUrl, { isBlurry: false, isDark: false, isOverexposed: false, blurScore: 0, brightness: 128, warnings: [] })
        } else {
          const dataUrl = await compressPhoto(file)
          const q = await checkPhotoQuality(
            dataUrl,
            t('photoBlurry'),
            t('photoDark'),
            t('photoOverexposed')
          )
          addPhoto(fieldId, dataUrl, q)
        }
      } catch (err) {
        console.error('Photo error:', err)
      }
    }
  }

  const isPdf = (src: string) => src.startsWith('data:application/pdf')

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-400">*</span>}
          {!required && (
            <span className="ml-1 text-[11px] font-normal text-gray-300">(opcional)</span>
          )}
        </span>
        {photos.length > 0 && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600">
            {photos.length}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Thumbnails */}
        {photos.map((src, i) => (
          <div
            key={i}
            className={`relative h-16 w-16 overflow-hidden rounded-xl ${
              isPdf(src)
                ? 'ring-1 ring-blue-200 bg-blue-50'
                : quality[i]?.warnings?.length > 0
                  ? 'ring-2 ring-amber-400'
                  : 'ring-1 ring-gray-100'
            }`}
          >
            {isPdf(src) ? (
              <div className="flex h-full w-full flex-col items-center justify-center">
                <FileText size={20} className="text-blue-500" />
                <span className="text-[8px] font-bold text-blue-500">PDF</span>
              </div>
            ) : (
              <img src={src} alt="" className="h-full w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => removePhoto(fieldId, i)}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={10} />
            </button>
            {!isPdf(src) && quality[i]?.warnings?.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 bg-amber-500/90 py-0.5 text-[8px] font-bold text-white">
                <AlertTriangle size={8} />
                {quality[i].warnings.length}
              </div>
            )}
          </div>
        ))}

        {/* Add photo button */}
        <button
          type="button"
          onClick={() => imgInputRef.current?.click()}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-300 active:border-brand-300 active:bg-brand-50 active:text-brand-500"
        >
          <Camera size={18} />
        </button>

        {/* Add PDF button */}
        <button
          type="button"
          onClick={() => pdfInputRef.current?.click()}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 text-blue-300 active:border-blue-400 active:bg-blue-50 active:text-blue-500"
        >
          <FileText size={16} />
          <span className="text-[8px] font-bold">PDF</span>
        </button>
      </div>

      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files).then(() => { e.target.value = '' })}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files).then(() => { e.target.value = '' })}
      />
    </div>
  )
}
