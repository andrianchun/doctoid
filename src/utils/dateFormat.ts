export type DateFormat = 'DD/MM/YY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD MMM YYYY'
export type TimeFormat = '24h' | '12h'

export function getStoredDateFormat(): DateFormat {
  const stored = localStorage.getItem('doctoid_date_format') as DateFormat
  // Format baku aplikasi adalah DD/MM/YY sesuai preferensi klinis dokter
  if (!stored || stored === 'DD/MM/YYYY') {
    return 'DD/MM/YY'
  }
  return stored
}

export function saveDateFormat(fmt: DateFormat): void {
  localStorage.setItem('doctoid_date_format', fmt)
}

export function getStoredTimeFormat(): TimeFormat {
  return (localStorage.getItem('doctoid_time_format') as TimeFormat) || '24h'
}

export function saveTimeFormat(fmt: TimeFormat): void {
  localStorage.setItem('doctoid_time_format', fmt)
}

export function formatDate(isoOrDate: string | Date | undefined | null, customFmt?: DateFormat): string {
  if (!isoOrDate) return '—'
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (isNaN(d.getTime())) return String(isoOrDate)

  const fmt = customFmt || getStoredDateFormat()
  const day = String(d.getDate()).padStart(2, '0')
  const monthNum = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const shortYear = String(year).slice(-2)

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
  const monthName = MONTHS_SHORT[d.getMonth()]

  switch (fmt) {
    case 'DD/MM/YY':
      return `${day}/${monthNum}/${shortYear}`
    case 'YYYY-MM-DD':
      return `${year}-${monthNum}-${day}`
    case 'DD MMM YYYY':
      return `${day} ${monthName} ${shortYear}`
    case 'DD/MM/YYYY':
      return `${day}/${monthNum}/${year}`
    default:
      return `${day}/${monthNum}/${shortYear}`
  }
}

export function formatTime(isoOrDate: string | Date | undefined | null, customFmt?: TimeFormat): string {
  if (!isoOrDate) return '—'
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (isNaN(d.getTime())) return String(isoOrDate)

  const fmt = customFmt || getStoredTimeFormat()
  const hours24 = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')

  if (fmt === '12h') {
    const ampm = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 % 12 || 12
    return `${hours12}:${minutes} ${ampm}`
  }

  return `${String(hours24).padStart(2, '0')}:${minutes}`
}

export function formatDateTime(isoOrDate: string | Date | undefined | null): string {
  if (!isoOrDate) return '—'
  return `${formatDate(isoOrDate)} ${formatTime(isoOrDate)}`
}

export function hariKe(isoOrDate?: string | Date | null): number {
  if (!isoOrDate) return 1
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate.slice(0, 10)) : isoOrDate
  if (isNaN(d.getTime())) return 1
  return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86400000) + 1)
}

/**
 * Mengembalikan tanggal lokal perangkat dalam format baku YYYY-MM-DD.
 * Menghindari bug timezone UTC (mis. toISOString() yang mundur 1 hari sebelum jam 07:00 pagi WIB).
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Konversi tanggal ISO (YYYY-MM-DD) ke tampilan DD/MM/YY.
 */
export function toDisplayDate(isoDate?: string | null): string {
  if (!isoDate) return ''
  const clean = isoDate.slice(0, 10)
  const parts = clean.split('-')
  if (parts.length === 3) {
    const [y, m, d] = parts
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.slice(-2)}`
  }
  return isoDate
}

/**
 * Konversi input teks DD/MM/YY atau DD/MM/YYYY atau YYYY-MM-DD ke format baku ISO (YYYY-MM-DD).
 */
export function parseToIsoDate(text: string): string | null {
  if (!text) return null
  const clean = text.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean

  const match = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!match) return null
  let [, d, m, y] = match
  let fullYear = parseInt(y, 10)
  if (y.length === 2) {
    fullYear = fullYear < 70 ? 2000 + fullYear : 1900 + fullYear
  }
  const dayNum = parseInt(d, 10)
  const monthNum = parseInt(m, 10)
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null
  return `${fullYear}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
}
