import { GOOGLE_SCRIPT_URL } from './constants'
import type { TeamConfig, ClientType, Cita, Report, Submission } from '../types'

interface ConfigResponse {
  teams: Array<{
    pin: string
    name: string
    client: string
    members: string[]
  }>
}

export async function fetchConfig(): Promise<TeamConfig[]> {
  try {
    const resp = await fetch(GOOGLE_SCRIPT_URL + '?action=getConfig')
    const data: ConfigResponse = await resp.json()
    if (data.teams && data.teams.length > 0) {
      return data.teams.map((t) => {
        let cl: ClientType = 'glasfaser-plus'
        const raw = (t.client || '').toLowerCase()
        if (raw.includes('westconnect')) cl = 'westconnect'
        return { pin: t.pin, name: t.name, client: cl, members: t.members || [] }
      })
    }
  } catch (e) {
    console.error('Config load error:', e)
  }
  return fallbackTeams()
}

function fallbackTeams(): TeamConfig[] {
  return [
    { pin: '1234', name: 'Plus-001', client: 'glasfaser-plus', members: ['Erick Flores'] },
    {
      pin: '2345',
      name: 'West-001',
      client: 'westconnect',
      members: ['Alejandro Herrera', 'Alexander Herrera'],
    },
    {
      pin: '3456',
      name: 'West-002',
      client: 'westconnect',
      members: ['Juan Correa', 'Eddier Aldana'],
    },
    { pin: '4567', name: 'West-003', client: 'westconnect', members: ['Andrés Melgarejo'] },
    { pin: '5678', name: 'West-004', client: 'westconnect', members: ['Michel Matos'] },
  ]
}

export async function submitReport(data: Submission): Promise<boolean> {
  const resp = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  // no-cors means opaque response, we can't read status
  // If it didn't throw, consider it sent
  return resp.type === 'opaque' || resp.ok
}

export async function fetchReports(): Promise<Report[]> {
  const resp = await fetch(GOOGLE_SCRIPT_URL + '?action=getReports')
  const json = await resp.json()
  const raw = json.reports || json.data || json || []
  const STATUS_NORMALIZE: Record<string, string> = {
    completed: 'completed-ok',
    'not-ok': 'completed-not-ok',
    absent: 'client-absent',
  }
  return raw.map((r: Record<string, unknown>) => ({
    ...r,
    workStatus: STATUS_NORMALIZE[r.workStatus as string] || r.workStatus,
    date: (r.date as string) || ((r.timestamp as string) || '').split('T')[0],
    startTime: parseTime(r.startTime as string),
    endTime: parseTime(r.endTime as string),
    duration: calcDuration(
      parseTime(r.startTime as string),
      parseTime(r.endTime as string)
    ),
    photoCount: (r.photoCount as number) || 0,
  }))
}

function parseTime(val: unknown): string {
  if (!val) return ''
  const s = String(val)
  if (s.includes('1899')) {
    const m = s.match(/T(\d{2}:\d{2})/)
    return m ? m[1] : ''
  }
  if (/^\d{2}:\d{2}/.test(s)) return s.substring(0, 5)
  return s
}

function calcDuration(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

export function formatDuration(mins: number): string {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function fetchCitasByTeam(team: string, date: string): Promise<Cita[]> {
  const resp = await fetch(
    `${GOOGLE_SCRIPT_URL}?action=getCitasByTeam&team=${encodeURIComponent(team)}&date=${date}`
  )
  const data = await resp.json()
  // Backend returns `direccion` but Cita type uses `calle`, and times as Date objects
  return (data.citas || []).map((c: Record<string, unknown>) => ({
    ...c,
    calle: c.calle || c.direccion || '',
    cp: String(c.cp || ''),
    inicio: parseTime(c.inicio),
    fin: parseTime(c.fin),
  }))
}

export async function fetchCitasJson(): Promise<{ generated: string; citas: Cita[] }> {
  const resp = await fetch('citas.json?t=' + Date.now())
  return resp.json()
}

export async function assignCita(params: Record<string, string>): Promise<{ success: boolean; error?: string }> {
  const search = new URLSearchParams({ action: 'assignCita', ...params })
  const resp = await fetch(`${GOOGLE_SCRIPT_URL}?${search}`, { redirect: 'follow' })
  const text = await resp.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Non-JSON response: ' + text.substring(0, 100))
  }
}

export async function updateCitaStatus(
  citaId: string,
  status: string,
  comments?: string
): Promise<{ success: boolean }> {
  const params = new URLSearchParams({
    action: 'updateCitaStatus',
    citaId,
    status,
    ...(comments ? { notas: comments } : {}),
  })
  const resp = await fetch(`${GOOGLE_SCRIPT_URL}?${params}`, { redirect: 'follow' })
  return resp.json()
}
