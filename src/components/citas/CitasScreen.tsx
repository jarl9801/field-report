import { useCallback, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { fetchCitasByTeam, updateCitaStatus as apiUpdateCitaStatus } from '../../lib/api'
import { CITA_STATUS_DONE } from '../../types'
import type { Cita } from '../../types'
import { CitaCard } from './CitaCard'

let _citasRenders = 0
export function CitasScreen() {
  _citasRenders++
  if (_citasRenders > 30) console.error('CitasScreen re-render loop! count:', _citasRenders)
  const { t, lang } = useTranslation()
  const currentTeam = useAppStore((s) => s.currentTeam)
  const setSelectedCita = useAppStore((s) => s.setSelectedCita)
  const setFormField = useAppStore((s) => s.setFormField)
  const setView = useAppStore((s) => s.setView)
  const addToast = useAppStore((s) => s.addToast)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)

  const teamName = currentTeam?.name || ''

  const loadCitas = useCallback(
    async (dateStr: string) => {
      if (!teamName) return
      setLoading(true)
      try {
        const result = await fetchCitasByTeam(teamName, dateStr)
        setCitas(result)
      } catch {
        setCitas([])
      } finally {
        setLoading(false)
      }
    },
    [teamName]
  )

  useEffect(() => {
    if (!teamName) return
    // Load today's citas directly — no 14-day loop (too slow, causes issues)
    const today = new Date().toISOString().split('T')[0]!
    setDate(today)
    setLoading(true)
    fetchCitasByTeam(teamName, today)
      .then((result) => { setCitas(result) })
      .catch(() => { setCitas([]) })
      .finally(() => { setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamName])

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    void loadCitas(newDate)
  }

  const filtered = citas.filter((c) =>
    tab === 'history' ? CITA_STATUS_DONE.includes(c.status) : !CITA_STATUS_DONE.includes(c.status)
  )

  const handleCapture = async (citaId: string) => {
    try {
      await apiUpdateCitaStatus(citaId, 'capturada')
      void loadCitas(date)
    } catch {
      addToast('Error updating cita', 'error')
    }
  }

  const handleStart = async (cita: Cita) => {
    try {
      await apiUpdateCitaStatus(cita.id, 'en_trabajo')
    } catch {
      // continue anyway
    }
    setSelectedCita(cita)
    if (cita.ha) setFormField('ha', cita.ha)
    if (cita.inicio) setFormField('startTime', cita.inicio)
    setView('form')
  }

  const handleFinish = (cita: Cita) => {
    setSelectedCita(cita)
    if (cita.ha) setFormField('ha', cita.ha)
    setView('form')
  }

  const handleSkip = () => {
    setSelectedCita(null)
    setView('form')
  }

  const dateLabel = (() => {
    const today = new Date().toISOString().split('T')[0]
    if (date === today) return lang === 'de' ? 'Heute' : 'Hoy'
    return new Date(date + 'T12:00:00').toLocaleDateString(
      lang === 'de' ? 'de-DE' : 'es-ES',
      { weekday: 'long', day: 'numeric', month: 'short' }
    )
  })()

  return (
    <div className="animate-fade-in mx-auto max-w-lg p-4">
      {/* Header */}
      <div className="mb-4">
        <div className="mb-0.5 rounded-full inline-block bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
          Westconnect
        </div>
        <h2 className="text-xl font-extrabold text-gray-900">{teamName}</h2>
        <p className="text-[13px] font-medium text-gray-400">{dateLabel}</p>
      </div>

      {/* Date picker */}
      <input
        type="date"
        value={date}
        onChange={(e) => handleDateChange(e.target.value)}
        className="input-field mb-3"
      />

      {/* Tabs */}
      <div className="mb-4 flex rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
            tab === 'pending'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400'
          }`}
        >
          {t('citasPending')}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
            tab === 'history'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400'
          }`}
        >
          {t('citasHistory')}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-[13px] text-gray-300">{t('citasLoading')}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mb-2 text-4xl">📅</div>
          <p className="text-[13px] text-gray-400">{t('citasEmpty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((cita) => (
            <CitaCard
              key={cita.id}
              cita={cita}
              onCapture={handleCapture}
              onStart={handleStart}
              onFinish={handleFinish}
            />
          ))}
        </div>
      )}

      {/* Skip button */}
      <button
        type="button"
        onClick={handleSkip}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-4 text-[13px] font-bold text-gray-400 active:bg-gray-50"
      >
        {lang === 'de' ? 'Ohne Termin fortfahren' : 'Continuar sin cita'}
        <ArrowRight size={16} />
      </button>
    </div>
  )
}
