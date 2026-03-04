import { useMemo, useState, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { WC_SOTANO_BASE, WC_AP_PHOTOS, WC_WE_PHOTOS, WC_EXTERIOR } from '../../data/wcPhotos'
import { NE4_CHECKS, CATEGORY_COLORS } from '../../data/ne4Checklist'
import { PhotoField } from '../ui/PhotoField'
import { ValidationScoreCard } from './ValidationScoreCard'
import { IS_FINALIZED } from '../../types'
import type { WorkStatus, RouteType } from '../../types'
import type { TranslationKey } from '../../lib/i18n'
import { HelpCircle, X } from 'lucide-react'

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

function HelpButton({ helpKey, t }: { helpKey: TranslationKey; t: (k: TranslationKey) => string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-brand-50 hover:text-brand-500"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="relative max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500"
            >
              <X size={14} />
            </button>
            <p className="pr-8 text-[13px] leading-relaxed text-gray-700">{t(helpKey)}</p>
          </div>
        </div>
      )}
    </>
  )
}

export function WcSection() {
  const { t } = useTranslation()
  const formData = useAppStore((s) => s.formData)
  const setFormField = useAppStore((s) => s.setFormField)
  const checkedItems = useAppStore((s) => s.checkedItems)
  const toggleChecked = useAppStore((s) => s.toggleChecked)
  const photos = useAppStore((s) => s.photos)
  const weNT = useAppStore((s) => s.weNT)
  const setWeNT = useAppStore((s) => s.setWeNT)
  const weAtenuacion = useAppStore((s) => s.weAtenuacion)
  const setWeAtenuacion = useAppStore((s) => s.setWeAtenuacion)

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

  // Route type
  const routeType = (formData.routeType || '') as RouteType

  // Negocios
  const hasNegocios = formData.hasNegocios === 'true'

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
              Primera Cita
            </button>
            <button
              type="button"
              onClick={() => setFormField('visitType', 'segunda')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
                isSegunda ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              Segunda Cita
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
            <div className="mb-3">
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

            {/* Feature 3: Negocios toggle */}
            <label className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
              <input
                type="checkbox"
                checked={hasNegocios}
                onChange={(e) => setFormField('hasNegocios', e.target.checked ? 'true' : 'false')}
                className="h-5 w-5 rounded accent-brand-500"
              />
              <div className="text-[13px] font-semibold text-gray-800">{t('hasNegocios')}</div>
            </label>
            {hasNegocios && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-amber-600">Fusiones para Negocios</p>
                <div className="mb-2">
                  <label className="mb-1 block text-[12px] font-medium text-gray-600">{t('negociosFibras')}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.negociosFibras || ''}
                    onChange={(e) => setFormField('negociosFibras', e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-[12px] font-medium text-gray-600">{t('negociosDetalle')}</label>
                  <textarea
                    value={formData.negociosDetalle || ''}
                    onChange={(e) => setFormField('negociosDetalle', e.target.value)}
                    placeholder="Ej: Local 1 planta baja — 2 fibras..."
                    className="input-field min-h-[60px] resize-y"
                  />
                </div>
                <PhotoField fieldId="wc_negocios_foto" label={t('negociosFoto')} required={false} />
              </div>
            )}
          </>
        )}
      </section>

      {/* SEGUNDA CITA — Observaciones + fotos ilimitadas con descripción */}
      {isSegunda && isFinalized && (
        <section className="section-card">
          <h3 className="mb-3 text-[15px] font-extrabold text-gray-900">Segunda Cita</h3>
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

          {/* Fotos Sótano */}
          <section className="section-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-extrabold text-gray-900">Sótano — Distribución fibra</h3>
                <HelpButton helpKey="helpSotano" t={t} />
              </div>
              <CountBadge filled={sotanoFilled} total={sotanoReq} />
            </div>
            {WC_SOTANO_BASE.map((p) => (
              <PhotoField key={p.id} fieldId={p.id} label={p.label} required={p.required} />
            ))}
          </section>

          {/* Feature 2: Ruta del cableado */}
          <section className="section-card">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-[15px] font-extrabold text-gray-900">{t('routeLabel')}</h3>
              <HelpButton helpKey="helpRoute" t={t} />
            </div>
            <select
              value={routeType}
              onChange={(e) => setFormField('routeType', e.target.value)}
              className="input-field mb-3"
            >
              <option value="">Seleccionar...</option>
              <option value="chimney">{t('routeChimney')}</option>
              <option value="facade">{t('routeFacade')}</option>
              <option value="corridor">{t('routeCorridor')}</option>
            </select>
            {routeType === 'chimney' && (
              <>
                <PhotoField fieldId="route_foto1" label={t('routeChimneyIn')} required={true} />
                <PhotoField fieldId="route_foto2" label={t('routeChimneyOut')} required={true} />
              </>
            )}
            {routeType === 'facade' && (
              <>
                <PhotoField fieldId="route_foto1" label={t('routeFacadeCable')} required={true} />
                <PhotoField fieldId="route_foto2" label={t('routeFacadeFix')} required={true} />
              </>
            )}
            {routeType === 'corridor' && (
              <>
                <PhotoField fieldId="route_foto1" label={t('routeCorridorT1')} required={true} />
                <PhotoField fieldId="route_foto2" label={t('routeCorridorT2')} required={false} />
                <PhotoField fieldId="route_foto3" label={t('routeCorridorFix')} required={true} />
              </>
            )}
          </section>

          {/* AP toggle + fotos */}
          <section className="section-card">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-[15px] font-extrabold text-gray-900">Punto de Acceso (AP)</h3>
              <HelpButton helpKey="helpAP" t={t} />
            </div>
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
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-[15px] font-extrabold text-gray-900">
                  Fotos por Vivienda ({numWe} WE)
                </h3>
                <HelpButton helpKey="helpWE" t={t} />
              </div>
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
                const ntData = weNT[weId] || { mounted: false, status: '', notas: '' }
                const atenVal = weAtenuacion[weId] ?? null
                const atenOutOfRange = atenVal !== null && (atenVal < -1.5 || atenVal > 1.5)
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

                    {/* Feature 4: Atenuación */}
                    <div className="mb-3">
                      <label className="mb-1 block text-[12px] font-medium text-gray-600">
                        {t('atenuacionLabel')}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={atenVal !== null ? atenVal : ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setWeAtenuacion(weId, v === '' ? null : parseFloat(v))
                        }}
                        className={`input-field ${atenOutOfRange ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                        placeholder="-0.5"
                      />
                      {atenOutOfRange && (
                        <p className="mt-1 text-[11px] font-semibold text-red-500">
                          {t('atenuacionWarning')}
                        </p>
                      )}
                    </div>

                    {/* Feature 1: NT/ONT toggle */}
                    <div className="mt-2 rounded-xl bg-gray-50 p-3">
                      <label className="mb-2 flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={ntData.mounted}
                          onChange={(e) => setWeNT(weId, { mounted: e.target.checked })}
                          className="h-5 w-5 rounded accent-brand-500"
                        />
                        <span className="text-[13px] font-semibold text-gray-800">{t('ntMounted')}</span>
                      </label>
                      {ntData.mounted && (
                        <div className="mt-2 pl-8">
                          <label className="mb-1 block text-[12px] font-medium text-gray-600">{t('ntStatus')}</label>
                          <select
                            value={ntData.status}
                            onChange={(e) => setWeNT(weId, { status: e.target.value })}
                            className="input-field mb-2"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="working">{t('ntWorking')}</option>
                            <option value="not-working">{t('ntNotWorking')}</option>
                          </select>
                          {ntData.status === 'working' && (
                            <>
                              <PhotoField fieldId={`${weId}_ont_led`} label={t('ntWorking') + ' (LEDs)'} required={false} />
                              <PhotoField fieldId={`${weId}_ont_serie`} label="Nº Serie NT (ALCL...)" required={false} />
                            </>
                          )}
                          {ntData.status === 'not-working' && (
                            <div>
                              <label className="mb-1 block text-[12px] font-medium text-gray-600">{t('ntWhyNotWorking')}</label>
                              <textarea
                                value={ntData.notas}
                                onChange={(e) => setWeNT(weId, { notas: e.target.value })}
                                className="input-field min-h-[50px] resize-y"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {/* Exterior */}
          <section className="section-card">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-[15px] font-extrabold text-gray-900">Fotos Exterior</h3>
              <HelpButton helpKey="helpExterior" t={t} />
            </div>
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
