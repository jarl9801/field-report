import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { fetchCitasByTeam, fetchHistoryCitas, updateCitaStatus as apiUpdateCitaStatus } from '../../lib/api'
import { CITA_STATUS_DONE } from '../../types'
import type { Cita } from '../../types'
import { CitaCard } from './CitaCard'

export function CitasScreen() {
  const { t, lang } = useTranslation()
  const currentTeam = useAppStore((s) => s.currentTeam)
  const setSelectedCita = useAppStore((s) => s.setSelectedCita)
  const setFormField = useAppStore((s) => s.setFormField)
  const setView = useAppStore((s) => s.setView)
  const addToast = useAppStore((s) => s.addToast)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [liveCitas, setLiveCitas] = useState<Cita[]>([])
  const [historyCitas, setHistoryCitas] = useState<Cita[]>([])
  const [loadingLive, setLoadingLive] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const teamName = currentTeam?.name || ''

  // Load live citas for selected date
  const loadLive = useCallback(async (dateStr: string) => {
    if (!teamName) return
    setLoadingLive(true)
    try {
      const result = await fetchCitasByTeam(teamName, dateStr)
      // Live = not done
      setLiveCitas(result.filter(c => !CITA_STATUS_DONE.includes(c.status)))
    } catch {
      addToast('Error cargando citas', 'error')
      setLiveCitas([])
    } finally {
      setLoadingLive(false)
    }
  }, [teamName, addToast])

  // Load full history (all closed orders)
  const loadHistory = useCallback(async () => {
    if (!teamName || historyLoaded) return
    setLoadingHistory(true)
    try {
      const result = await fetchHistoryCitas(teamName)
      setHistoryCitas(result)
      setHistoryLoaded(true)
    } catch {
      addToast('Error cargando historial', 'error')
      setHistoryCitas([])
    } finally {
      setLoadingHistory(false)
    }
  }, [teamName, historyLoaded, addToast])

  // Initial load of live citas
  useEffect(() => {
    if (!teamName) return
    void loadLive(new Date().toISOString().split('T')[0])
  }, [teamName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load history when switching to history tab
  useEffect(() => {
    if (tab === 'history') void loadHistory()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    void loadLive(newDate)
  }

  const handleRefresh = () => {
    if (tab === 'pending') void loadLive(date)
    else {
      setHistoryLoaded(false)
      setHistoryCitas([])
      void loadHistory()
    }
  }

  const handleCapture = async (citaId: string) => {
    try {
      await apiUpdateCitaStatus(citaId, 'capturada')
      void loadLive(date)
    } catch {
      addToast('Error actualizando cita', 'error')
    }
  }

  const handleStart = async (cita: Cita) => {
    try { await apiUpdateCitaStatus(cita.id, 'en_trabajo') } catch { /* continue */ }
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

  const isLoading = tab === 'pending' ? loadingLive : loadingHistory
  const shownCitas = tab === 'pending' ? liveCitas : historyCitas

  return (
    <div className="animate-fade-in mx-auto max-w-lg p-4">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="mb-0.5 rounded-full inline-block bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
            Westconnect
          </div>
          <h2 className="text-xl font-extrabold text-gray-900">{teamName}</h2>
          <p className="text-[13px] font-medium text-gray-400">{dateLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="mt-1 rounded-xl bg-gray-100 p-2.5 text-gray-500 active:bg-gray-200 disabled:opacity-40"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Date picker — only for live tab */}
      {tab === 'pending' && (
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="input-field mb-3"
        />
      )}

      {/* Tabs */}
      <div className="mb-4 flex rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
            tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
          }`}
        >
          {t('citasPending')}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`relative flex-1 rounded-lg py-2.5 text-[13px] font-bold transition-all ${
            tab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
          }`}
        >
          {t('citasHistory')}
          {historyCitas.length > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] text-white">
              {historyCitas.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-16 text-center text-[13px] text-gray-300">{t('citasLoading')}</div>
      ) : shownCitas.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mb-2 text-4xl">{tab === 'history' ? '📋' : '📅'}</div>
          <p className="text-[13px] text-gray-400">
            {tab === 'history' ? 'Sin órdenes cerradas' : t('citasEmpty')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shownCitas.map((cita) => (
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

      {/* Skip button — only on pending tab */}
      {tab === 'pending' && (
        <button
          type="button"
          onClick={handleSkip}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-4 text-[13px] font-bold text-gray-400 active:bg-gray-50"
        >
          {lang === 'de' ? 'Ohne Termin fortfahren' : 'Continuar sin cita'}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  )
}
