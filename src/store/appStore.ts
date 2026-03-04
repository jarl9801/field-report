import { create } from 'zustand'
import type {
  ViewName,
  Lang,
  ClientType,
  TeamConfig,
  PhotoQuality,
  Submission,
  Cita,
  WeNTData,
} from '../types'
import { fetchConfig } from '../lib/api'
import * as db from '../lib/db'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

interface AppState {
  // Navigation
  view: ViewName
  setView: (v: ViewName) => void

  // Auth
  lang: Lang
  setLang: (l: Lang) => void
  pin: string
  setPin: (p: string) => void
  teamConfigs: TeamConfig[]
  teamsMap: Record<string, TeamConfig>
  configLoaded: boolean
  currentTeam: TeamConfig | null
  currentTechnician: string
  setCurrentTeam: (t: TeamConfig | null) => void
  setCurrentTechnician: (name: string) => void
  loadConfig: () => Promise<void>

  // Form
  clientType: ClientType | null
  formData: Record<string, string>
  setFormField: (key: string, value: string) => void
  photos: Record<string, string[]>
  photoQuality: Record<string, PhotoQuality[]>
  addPhoto: (fieldId: string, dataUrl: string, quality: PhotoQuality) => void
  removePhoto: (fieldId: string, index: number) => void
  hasPhoto: (fieldId: string) => boolean
  weNT: Record<string, WeNTData>
  setWeNT: (weId: string, data: Partial<WeNTData>) => void
  weAtenuacion: Record<string, number | null>
  setWeAtenuacion: (weId: string, val: number | null) => void
  checkedItems: string[]
  toggleChecked: (id: string) => void
  protocols: string[]
  toggleProtocol: (id: string) => void
  resetForm: () => void

  // Submissions
  submissions: Submission[]
  loadSubmissions: () => Promise<void>
  addSubmission: (s: Submission) => Promise<void>

  // Citas
  selectedCita: Cita | null
  setSelectedCita: (c: Cita | null) => void

  // UI
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void

  // Modal
  modal: { open: boolean; type: string; data?: unknown }
  openModal: (type: string, data?: unknown) => void
  closeModal: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  view: 'pin',
  setView: (v) => set({ view: v }),

  // Auth
  lang: 'es',
  setLang: (l) => set({ lang: l }),
  pin: '',
  setPin: (p) => set({ pin: p }),
  teamConfigs: [],
  teamsMap: {},
  configLoaded: false,
  currentTeam: null,
  currentTechnician: '',
  setCurrentTeam: (t) => set({ currentTeam: t, clientType: t?.client || null }),
  setCurrentTechnician: (name) => set({ currentTechnician: name }),
  loadConfig: async () => {
    const teams = await fetchConfig()
    const map: Record<string, TeamConfig> = {}
    teams.forEach((t) => { map[t.pin] = t })
    set({ teamConfigs: teams, teamsMap: map, configLoaded: true })
  },

  // Form
  clientType: null,
  formData: {},
  setFormField: (key, value) =>
    set((s) => ({ formData: { ...s.formData, [key]: value } })),
  photos: {},
  photoQuality: {},
  addPhoto: (fieldId, dataUrl, quality) =>
    set((s) => ({
      photos: {
        ...s.photos,
        [fieldId]: [...(s.photos[fieldId] || []), dataUrl],
      },
      photoQuality: {
        ...s.photoQuality,
        [fieldId]: [...(s.photoQuality[fieldId] || []), quality],
      },
    })),
  removePhoto: (fieldId, index) =>
    set((s) => {
      const photos = [...(s.photos[fieldId] || [])]
      const quality = [...(s.photoQuality[fieldId] || [])]
      photos.splice(index, 1)
      quality.splice(index, 1)
      return {
        photos: { ...s.photos, [fieldId]: photos },
        photoQuality: { ...s.photoQuality, [fieldId]: quality },
      }
    }),
  hasPhoto: (fieldId) => {
    const p = get().photos[fieldId]
    return !!p && p.length > 0
  },
  weNT: {},
  setWeNT: (weId, data) =>
    set((s) => ({
      weNT: {
        ...s.weNT,
        [weId]: { ...(s.weNT[weId] || { mounted: false, status: '', notas: '' }), ...data },
      },
    })),
  weAtenuacion: {},
  setWeAtenuacion: (weId, val) =>
    set((s) => ({ weAtenuacion: { ...s.weAtenuacion, [weId]: val } })),
  checkedItems: [],
  toggleChecked: (id) =>
    set((s) => ({
      checkedItems: s.checkedItems.includes(id)
        ? s.checkedItems.filter((x) => x !== id)
        : [...s.checkedItems, id],
    })),
  protocols: [],
  toggleProtocol: (id) =>
    set((s) => ({
      protocols: s.protocols.includes(id)
        ? s.protocols.filter((x) => x !== id)
        : [...s.protocols, id],
    })),
  resetForm: () =>
    set({
      formData: {},
      photos: {},
      photoQuality: {},
      checkedItems: [],
      protocols: [],
      selectedCita: null,
      weNT: {},
      weAtenuacion: {},
    }),

  // Submissions
  submissions: [],
  loadSubmissions: async () => {
    try {
      const subs = await db.getAll()
      set({ submissions: subs })
    } catch (e) {
      console.error('Load submissions error:', e)
    }
  },
  addSubmission: async (s) => {
    await db.add(s)
    set((state) => ({ submissions: [...state.submissions, s] }))
  },

  // Citas
  selectedCita: null,
  setSelectedCita: (c) => set({ selectedCita: c }),

  // UI
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now().toString(36)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().removeToast(id), 5000)
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Modal
  modal: { open: false, type: '' },
  openModal: (type, data) => set({ modal: { open: true, type, data } }),
  closeModal: () => set({ modal: { open: false, type: '' } }),
}))
