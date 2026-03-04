import type { PhotoDef, WePhotoDef } from '../types'

// Primera cita — Sótano (sin AP)
export const WC_SOTANO_BASE: PhotoDef[] = [
  { id: 'wc_gv_abierto', label: 'GF-GV Abierto (antes de trabajos)', required: true },
  { id: 'wc_gv_fusiones', label: 'GF-GV con fusiones y patch cables conectados', required: true },
  { id: 'wc_sotano_recorrido', label: 'Recorrido completo sótano (cable entrada → GF-GV)', required: true },
  { id: 'wc_gv_cerrado_final', label: 'GF-GV Cerrado al final', required: true },
  { id: 'wc_sello_sotano', label: 'Sello Cortafuegos sótano', required: false },
]

// Primera cita — Fotos del AP (solo si existe AP)
export const WC_AP_PHOTOS: PhotoDef[] = [
  { id: 'wc_ap_canal_abierto', label: 'AP + Canalizado Abierto (cable visible)', required: true },
  { id: 'wc_ap_canal_cerrado', label: 'AP + Canalizado Cerrado (trabajo terminado)', required: true },
  { id: 'wc_ap_patch_gv', label: 'Patch cable GF-AP → GF-GV conectado', required: true },
]

// Segunda cita — Fotos opcionales
export const WC_SEGUNDA_CITA: PhotoDef[] = [
  { id: 'wc_sc_foto1', label: 'Foto del trabajo realizado', required: false },
  { id: 'wc_sc_foto2', label: 'Foto adicional', required: false },
  { id: 'wc_sc_foto3', label: 'Foto adicional', required: false },
]

// Per-WE photos (primera cita)
export const WC_WE_PHOTOS: WePhotoDef[] = [
  { suffix: 'gfta', label: 'GF-TA con pegatinas Home ID', required: true },
  { suffix: 'patch', label: 'Cable patch GF-TA ↔ ONT', required: true },
  { suffix: 'ont_led', label: 'ONT funcionando (LEDs visibles)', required: true },
  { suffix: 'canal', label: 'Canal superficial hasta GF-TA', required: true },
  { suffix: 'ont_serie', label: 'Nº Serie ONT (ALCL...)', required: true },
  { suffix: 'medicion', label: 'Medición de fibra', required: false },
]

// Exterior (primera cita)
export const WC_EXTERIOR: PhotoDef[] = [
  { id: 'wc_canal_ext', label: 'Canal pasillo / escalera / exterior', required: true },
  { id: 'wc_sello_ext', label: 'Sello Cortafuegos exterior', required: false },
]

// Legacy exports for backward compatibility
export const WC_BASEMENT = WC_SOTANO_BASE
