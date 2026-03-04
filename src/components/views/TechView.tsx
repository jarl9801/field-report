import { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useOnline } from '../../hooks/useOnline'
import { submitReport, updateCitaStatus } from '../../lib/api'
import { computeValidationScore } from '../../lib/validation'
import { getGfpRequiredPhotos } from '../../data/gfpPhotos'
import { BasicInfoSection } from '../form/BasicInfoSection'
import { GfpSection } from '../form/GfpSection'
import { WcSection } from '../form/WcSection'
import { EvidenceSection } from '../form/EvidenceSection'
import { IS_FINALIZED, NEEDS_EVIDENCE } from '../../types'
import type { WorkStatus, Submission } from '../../types'

let _techRenders = 0
export function TechView() {
  _techRenders++
  if (_techRenders > 30) console.error('TechView re-render loop! count:', _techRenders)
  const { t, lang } = useTranslation()
  const online = useOnline()
  const [submitting, setSubmitting] = useState(false)

  const clientType = useAppStore((s) => s.clientType)
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentTechnician = useAppStore((s) => s.currentTechnician)
  const formData = useAppStore((s) => s.formData)
  const photos = useAppStore((s) => s.photos)
  const photoQuality = useAppStore((s) => s.photoQuality)
  const checkedItems = useAppStore((s) => s.checkedItems)
  const protocols = useAppStore((s) => s.protocols)
  const hasPhoto = useAppStore((s) => s.hasPhoto)
  const addSubmission = useAppStore((s) => s.addSubmission)
  const resetForm = useAppStore((s) => s.resetForm)
  const setView = useAppStore((s) => s.setView)
  const addToast = useAppStore((s) => s.addToast)
  const openModal = useAppStore((s) => s.openModal)
  const selectedCita = useAppStore((s) => s.selectedCita)

  const status = formData.workStatus as WorkStatus | ''
  const isFinalized = IS_FINALIZED.includes(status as WorkStatus)
  const needsEvidence = NEEDS_EVIDENCE.includes(status as WorkStatus)
  const isWc = clientType === 'westconnect'
  const isGfp = clientType === 'glasfaser-plus'

  // Validation score for WC finalized
  const valResult = useMemo(() => {
    if (!isWc || !isFinalized) return null
    return computeValidationScore({
      ha: formData.ha || '',
      startTime: formData.startTime || '',
      endTime: formData.endTime || '',
      date: formData.date || '',
      units: formData.units || '',
      variant: formData.variant || '',
      comments: formData.comments || '',
      photos,
      photoQuality,
      checkedItems,
      protocols,
      lang,
    })
  }, [isWc, isFinalized, formData, photos, photoQuality, checkedItems, protocols, lang])

  function validate(): boolean {
    const { date, startTime, endTime, workStatus, comments } = formData

    // Basic required fields
    if (!date || !startTime || !endTime || !workStatus) {
      addToast(t('fillRequired'), 'error')
      return false
    }
    if (startTime >= endTime) {
      addToast(t('timeError'), 'error')
      return false
    }

    // Evidence required for certain statuses
    if (needsEvidence) {
      if (!comments?.trim()) {
        addToast(t('needComments'), 'error')
        return false
      }
      if (!hasPhoto('evidence_1')) {
        addToast(t('needEvidence'), 'error')
        return false
      }
    }

    // GFP-specific
    if (isGfp) {
      if (!formData.orderNumber) {
        addToast(t('needOrder'), 'error')
        return false
      }
      if (!formData.buildingType) {
        addToast(t('needBuilding'), 'error')
        return false
      }
      if (isFinalized) {
        const reqPhotos = getGfpRequiredPhotos(formData.buildingType)
        const missing = reqPhotos.filter((p) => !hasPhoto(p.id))
        if (missing.length > 0) {
          addToast(t('needPhotos') + ': ' + missing[0].label, 'error')
          return false
        }
      }
    }

    // WC-specific
    const isSegundaCita = formData.workStatus === 'client-reschedule' || formData.visitType === 'segunda'
    if (isWc) {
      // En segunda cita solo se requiere HA (que viene de la cita)
      if (!isSegundaCita && (!formData.ha || !formData.units || !formData.variant)) {
        addToast(t('needHA'), 'error')
        return false
      }
      if (isFinalized && valResult && valResult.score < 30) {
        addToast(t('fillRequired') + ' — Score: ' + valResult.score + '%', 'error')
        return false
      }
    }

    return true
  }

  function collectData(): Submission {
    const data: Submission = {
      timestamp: new Date().toISOString(),
      team: currentTeam?.name || '',
      technician: currentTechnician,
      client: clientType!,
      date: formData.date || '',
      startTime: formData.startTime || '',
      endTime: formData.endTime || '',
      workStatus: (formData.workStatus as WorkStatus) || '',
      comments: formData.comments || '',
      supportTeam: formData.supportTeam || '',
      photos,
    }

    if (isGfp) {
      data.orderNumber = formData.orderNumber || ''
      data.buildingType = formData.buildingType || ''
    }

    if (isWc) {
      data.ha = formData.ha || ''
      data.units = formData.units || ''
      data.variant = formData.variant || ''
      data.protocols = protocols
      data.ne4Checklist = checkedItems
    }

    if (valResult) {
      data.validation_score = valResult.score
      data.validation_details = valResult.items
        .map((i) => `${i.label}: ${i.detail}`)
        .join(' | ')
    }

    if (selectedCita) {
      data.citaId = selectedCita.id
    }

    return data
  }

  async function doSubmit() {
    const data = collectData()
    setSubmitting(true)

    const WORK_TO_CITA: Record<string, string> = {
      'completed-ok': 'finalizada_ok',
      'completed-not-ok': 'finalizada_no_ok',
      'client-absent': 'cliente_ausente',
      'client-reschedule': 'recitar',
      'on-hold': 'paralizada',
      preinstalled: 'finalizada_ok',
    }

    try {
      if (online) {
        await submitReport(data)

        // Update linked cita status
        if (selectedCita?.id && data.workStatus) {
          const citaStatus = WORK_TO_CITA[data.workStatus] || 'finalizada_ok'
          void updateCitaStatus(selectedCita.id, citaStatus, data.comments)
        }

        await addSubmission(data)
        openModal('success')
        setTimeout(() => {
          resetForm()
          setView('member')
        }, 2500)
      } else {
        data.pendingSync = true
        await addSubmission(data)
        addToast(t('savedOffline'), 'warning')
        setTimeout(() => {
          resetForm()
          setView('member')
        }, 1500)
      }
    } catch {
      data.pendingSync = true
      await addSubmission(data)
      addToast(t('connError'), 'warning')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit() {
    if (!validate()) return

    // Score warning for WC finalized with low score
    if (valResult && valResult.score < 90) {
      openModal('scoreWarning', {
        score: valResult.score,
        onProceed: () => void doSubmit(),
      })
      return
    }

    void doSubmit()
  }

  return (
    <div className="animate-fade-in mx-auto flex max-w-lg flex-col gap-4 p-4 pb-28">
      <BasicInfoSection />

      {isGfp && <GfpSection />}
      {isWc && <WcSection />}
      {needsEvidence && <EvidenceSection />}

      {/* Fixed bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-lg gap-3">
          <button
            type="button"
            onClick={() => setView('history')}
            className="flex-1 rounded-xl bg-gray-100 px-4 py-3.5 text-[14px] font-bold text-gray-600 active:bg-gray-200"
          >
            {t('histBtn')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-xl bg-brand-500 px-4 py-3.5 text-[14px] font-bold text-white shadow-glow transition-all active:bg-brand-600 disabled:opacity-50 disabled:shadow-none"
          >
            {submitting ? t('sending') : t('sendBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
