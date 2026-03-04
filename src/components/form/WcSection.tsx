import { useMemo, useState, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { WC_SOTANO_BASE, WC_AP_PHOTOS, WC_SEGUNDA_CITA, WC_WE_PHOTOS, WC_EXTERIOR } from '../../data/wcPhotos'
import { NE4_CHECKS, CATEGORY_COLORS } from '../../data/ne4Checklist'
import { PhotoField } from '../ui/PhotoField'
import { ValidationScoreCard } from './ValidationScoreCard'
import { IS_FINALIZED } from '../../types'
import type { WorkStatus } from '../../types'

function CountBadge({ filled, total }: { filled: number; total: number }) {
  const done = filled === total
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
      done ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-400'
    }`}>
      {filled}/{total}
    </span>
  )
}

export function WcSection() {
  const { t } = useTranslation()
  const formData = useAppStore((s) => s.formData)
  const setFormField = useAppStore((s) => s.setFormField)
  const checkedItems = useAppStore((s) => s.checkedItems)
  const toggleChecked = useAppStore((s) => s.toggleChecked)
  const photos = useAppStore((s) => s.photos)

  const isFinalized = IS_FINALIZED.includes(formData.workStatus as WorkStatus)
  const numWe = parseInt(formData.units || '0') || 0
  const [activeWe, setActiveWe] = useState(1)

  // Primera / Segunda cita toggle
  const visitType = formData.visitType || 'primera'
  const isSegunda = visitType === 'segunda'

  // Dynamic photo slots for segunda cita
  const [photoSlots, setPhotoSlots] = useState<Array<{id: string; desc: string}>>([
    { id: 'sc_photo_0', desc: '' }
  ])
  const addPhotoSlot = useCallback(() => {
    setPhotoSlots(prev => [...prev, { id: `sc_photo_${prev.length}`, desc: '' }])
  }, [])
  const updateSlotDesc = useCallback((idx: number, desc: string) => {
    setPhotoSlots(prev => prev.map((s, i) => i === idx ? { ...s, desc } : s))
  }, [])

  // AP exists toggle (default true)
  const apExists = formData.apExists !== 'false'

  const haFormatOk = /^HA\d+$/i.test(formData.ha || '')

  // Photo counts
  const sotanoFilled = useMemo(
    () => WC_SOTANO_BASE.filter((p) => p.required && !!photos[p.id]?.length).length,
    [photos]
  )
  const sotanoReq = WC_SOTANO_BASE.filter((p) => p.required).length

  const apFilled = useMemo(
    () => WC_AP_PHOTOS.filter((p) => p.required && !!photos[p.id]?.length).length,
    [photos]
  )

  return (
    <>
      {/* HA Data */}
      <section className="section-card">
        <h3 className="mb-4 text-[15px] font-extrabold text-gray-900">Datos WestConnect</h3>

        {/* Primera / Segunda Cita toggle */}
        <div className="mb-4">
          <label className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-gray-400">
            Tipo de visita <span className="text-red-400">*</span>
          </label>
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setFormField('visitType', 'primera')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
                !isSegunda ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              🔧 Primera Cita
            </button>
            <button
              type="button"
              onClick={() => setFormField('visitType', 'segunda')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
                isSegunda ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              🔄 Segunda Cita
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-gray-400">
            HA <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.ha || ''}
            onChange={(e) => setFormField('ha', e.target.value)}
            placeholder="Ej: HA898706"
            className="input-field"
          />
          {formData.ha && !haFormatOk && (
            <p className="mt-1.5 text-[11px] font-medium text-amber-500">Formato: HA + números</p>
          )}
        </div>

        {!isSegunda && (
          <>
            <div className="mb-3">
              <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-gray-400">
                Unidades (WE) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={formData.units || ''}
                onChange={(e) => setFormField('units', e.target.value)}
                placeholder="Nº de viviendas"
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-gray-400">
                Variante <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.variant || ''}
                onChange={(e) => setFormField('variant', e.target.value)}
                className="input-field"
              >
                <option value="">Seleccionar...</option>
                <option value="empty-pipes">Tuberías vacías</option>
                <option value="interior-riser">Montante interior</option>
                <option value="corridor-riser">Montante pasillo</option>
                <option value="exterior-riser">Montante exterior</option>
              </select>
            </div>
          </>
        )}
      </section>

      {/* SEGUNDA CITA — Observaciones + fotos ilimitadas con descripción */}
      {isSegunda && isFinalized && (
        <section className="section-card">
          <h3 className="mb-3 text-[15px] font-extrabold text-gray-900">🔄 Segunda Cita</h3>
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-gray-400">
              Observaciones generales
            </label>
            <textarea
              value={formData.secondaNotas || ''}
              onChange={(e) => setFormField('secondaNotas', e.target.value)}
              placeholder="Describe el trabajo realizado en esta segunda visita..."
              className="input-field min-h-[80px] resize-y"
            />
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-wider text-gray-400">
              Fotos del trabajo
            </p>
            <span className="text-[11px] text-gray-400">{photoSlots.length} foto(s)</span>
          </div>

          {photoSlots.map((slot, idx) => (
            <div key={slot.id} className="mb-4 rounded-xl bg-gray-50 p-3">
              <input
                type="text"
                value={slot.desc}
                onChange={(e) => updateSlotDesc(idx, e.target.value)}
                placeholder={`Descripción foto ${idx + 1}`}
                className="input-field mb-2 text-[13px]"
              />
              <PhotoField fieldId={slot.id} label="" required={false} />
            </div>
          ))}

          <button
            type="button"
            onClick={addPhotoSlot}
            className="mt-1 w-full rounded-xl border-2 border-dashed border-brand-200 py-3 text-[13px] font-bold text-brand-500 active:bg-brand-50"
          >
            + Añadir foto
          </button>
        </section>
      )}

      {/* PRIMERA CITA — Fotos completas */}
      {!isSegunda && isFinalized && (
        <>
          {/* NE4 Checklist */}
          <section className="section-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold text-gray-900">Checklist NE4</h3>
              <CountBadge filled={checkedItems.length} total={NE4_CHECKS.length} />
            </div>
            <div className="flex flex-col gap-1.5">
              {NE4_CHECKS.map((item) => {
                const colors = CATEGORY_COLORS[item.category]
                const checked = checkedItems.includes(item.id)
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 rounded-xl border-l-[3px] p-3 transition-colors ${colors.border} ${
                      checked ? colors.bg : 'bg-gray-50/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChecked(item.id)}
                      className="mt-0.5 h-5 w-5 rounded-md accent-brand-500"
                    />
                    <div>
                      <div className="text-[13px] font-semibold text-gray-800">{t(item.titleKey)}</div>
                      <div className="text-[11px] text-gray-400">{t(item.descKey)}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </section>

          {/* Fotos Sótano — sin AP */}
          <section className="section-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold text-gray-900">📦 Sótano — Distribución fibra</h3>
              <CountBadge filled={sotanoFilled} total={sotanoReq} />
            </div>
            {WC_SOTANO_BASE.map((p) => (
              <PhotoField key={p.id} fieldId={p.id} label={p.label} required={p.required} />
            ))}
          </section>

          {/* AP toggle + fotos */}
          <section className="section-card">
            <h3 className="mb-4 text-[15px] font-extrabold text-gray-900">🔌 Punto de Acceso (AP)</h3>
            <label className="mb-4 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
              <input
                type="checkbox"
                checked={apExists}
                onChange={(e) => setFormField('apExists', e.target.checked ? 'true' : 'false')}
                className="h-5 w-5 rounded accent-brand-500"
              />
              <div>
                <div className="text-[13px] font-semibold text-gray-800">AP instalado / existente</div>
                <div className="text-[11px] text-gray-400">Desmarcar si no hay AP en este edificio</div>
              </div>
            </label>
            {apExists && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-gray-600">Fotos del AP</span>
                  <CountBadge filled={apFilled} total={WC_AP_PHOTOS.filter(p => p.required).length} />
                </div>
                {WC_AP_PHOTOS.map((p) => (
                  <PhotoField key={p.id} fieldId={p.id} label={p.label} required={p.required} />
                ))}
              </>
            )}
          </section>

          {/* Per-WE Photos */}
          {numWe > 0 && (
            <section className="section-card">
              <h3 className="mb-3 text-[15px] font-extrabold text-gray-900">
                🏠 Fotos por Vivienda ({numWe} WE)
              </h3>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {Array.from({ length: numWe }, (_, i) => i + 1).map((n) => {
                  const weId = 'we' + String(n).padStart(2, '0')
                  const reqPhotos = WC_WE_PHOTOS.filter((p) => p.required)
                  const weFilled = reqPhotos.filter((p) => !!photos[`${weId}_${p.suffix}`]?.length).length
                  const complete = weFilled === reqPhotos.length
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setActiveWe(n)}
                      className={`rounded-xl px-3 py-1.5 text-[12px] font-bold transition-all ${
                        n === activeWe
                          ? 'bg-brand-500 text-white shadow-glow'
                          : complete
                            ? 'bg-brand-50 text-brand-600'
                            : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      WE-{String(n).padStart(2, '0')}
                    </button>
                  )
                })}
              </div>
              {Array.from({ length: numWe }, (_, i) => i + 1).map((n) => {
                if (n !== activeWe) return null
                const weId = 'we' + String(n).padStart(2, '0')
                return (
                  <div key={n} className="animate-fade-in">
                    <p className="mb-3 text-[13px] font-bold text-gray-700">
                      WE-{String(n).padStart(2, '0')}
                    </p>
                    {WC_WE_PHOTOS.map((p) => (
                      <PhotoField
                        key={p.suffix}
                        fieldId={`${weId}_${p.suffix}`}
                        label={p.label}
                        required={p.required}
                      />
                    ))}
                  </div>
                )
              })}
            </section>
          )}

          {/* Exterior */}
          <section className="section-card">
            <h3 className="mb-4 text-[15px] font-extrabold text-gray-900">🏢 Fotos Exterior</h3>
            {WC_EXTERIOR.map((p) => (
              <PhotoField key={p.id} fieldId={p.id} label={p.label} required={p.required} />
            ))}
          </section>

          <ValidationScoreCard />
        </>
      )}
    </>
  )
}
