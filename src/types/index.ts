export type ViewName = 'pin' | 'member' | 'citas' | 'form' | 'history' | 'admin'
export type ClientType = 'glasfaser-plus' | 'westconnect'
export type Lang = 'es' | 'de'

export type WorkStatus =
  | 'completed-ok'
  | 'client-absent'
  | 'previous-states'
  | 'client-reschedule'
  | 'on-hold'
  | 'preinstalled'
  | 'completed-not-ok'

export interface TeamConfig {
  pin: string
  name: string
  client: ClientType
  members: string[]
}

export interface PhotoQuality {
  isBlurry: boolean
  isDark: boolean
  isOverexposed: boolean
  blurScore: number
  brightness: number
  warnings: string[]
}

export interface PhotoDef {
  id: string
  label: string
  required: boolean
}

export interface WePhotoDef {
  suffix: string
  label: string
  required: boolean
}

export interface Submission {
  id?: number
  timestamp: string
  team: string
  technician: string
  client: ClientType
  date: string
  startTime: string
  endTime: string
  workStatus: WorkStatus | ''
  comments: string
  supportTeam: string
  photos: Record<string, string[]>
  // GFP
  orderNumber?: string
  buildingType?: string
  // WC
  ha?: string
  units?: string
  variant?: string
  protocols?: string[]
  ne4Checklist?: string[]
  apInstalled?: 'yes' | 'no'
  weData?: WeData[]
  validation_score?: number
  validation_details?: string
  pendingSync?: boolean
  // Cita link
  citaId?: string
}

export interface WeData {
  weId: string
  nomenclature: string
  clientName: string
  present: boolean
}

export interface WeNTData {
  mounted: boolean
  status: string
  notas: string
}

export type RouteType = 'chimney' | 'facade' | 'corridor' | ''

export interface ValidationResult {
  items: ValidationItem[]
  totalPoints: number
  earnedPoints: number
  score: number
}

export interface ValidationItem {
  label: string
  ok: boolean
  detail: string
  cssClass: string
}

export interface Cita {
  id: string
  fecha: string
  ha: string
  tecnicos: number
  inicio: string
  fin: string
  calle: string
  cp: string
  ciudad: string
  titulo: string
  equipo: string
  status: string
  linkDocs: string
}

export interface Report {
  timestamp: string
  team: string
  technician: string
  client: string
  date: string
  startTime: string
  endTime: string
  workStatus: string
  comments: string
  orderNumber?: string
  ha?: string
  photoCount: number
  driveUrl?: string
  duration: number
  validation_score?: number
}

export const NEEDS_EVIDENCE: WorkStatus[] = [
  'client-absent',
  'previous-states',
  'client-reschedule',
  'on-hold',
  'completed-not-ok',
]

export const IS_FINALIZED: WorkStatus[] = ['completed-ok', 'preinstalled']

export const STATUS_MAP: Record<string, { label: string; badge: string; color: string }> = {
  'completed-ok': { label: 'Finalizada OK', badge: 'ok', color: '#00C853' },
  'client-absent': { label: 'Cliente Ausente', badge: 'absent', color: '#ffab40' },
  'previous-states': { label: 'Estados Previos', badge: 'hold', color: '#ffab40' },
  'client-reschedule': { label: 'Recitar', badge: 'absent', color: '#ffab40' },
  'on-hold': { label: 'Paralizada', badge: 'hold', color: '#ffab40' },
  preinstalled: { label: 'Preinstalada', badge: 'pre', color: '#448aff' },
  'completed-not-ok': { label: 'No OK', badge: 'notok', color: '#ff5252' },
}

export const CITA_STATUS_DONE = [
  'finalizada_ok',
  'finalizada_no_ok',
  'cliente_ausente',
  'recitar',
  'paralizada',
  'cancelada',
]

export const CITA_STATUS_LABELS: Record<string, string> = {
  libre: 'Libre',
  asignada: 'Asignada',
  capturada: 'Capturada',
  en_trabajo: 'En trabajo',
  finalizada_ok: 'Finalizada OK',
  finalizada_no_ok: 'Finalizada No OK',
  cliente_ausente: 'Ausente',
  recitar: 'Recitar',
  paralizada: 'Paralizada',
}
