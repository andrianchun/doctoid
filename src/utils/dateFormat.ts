export type DateFormat = 'DD/MM/YY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD MMM YYYY'
export type TimeFormat = '24h' | '12h'

export function getStoredDateFormat(): DateFormat {
  const stored = localStorage.getItem('doctoid_date_format') as DateFormat
  // Format baku aplikasi adalah DD/MM/YY sesuai preferensi klinis dokter
  if (!stored || stored === 'DD/MM/YYYY' || stored === 'YYYY-MM-DD') {
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

/**
 * Mengurai string atau Date menjadi objek Date lokal (jam 00:00:00 lokal) secara konsisten.
 * Menghindari bug bawaan JavaScript Date:
 * 1. "11/10/26" di-parse JS sebagai MM/DD/YY (10 November), bukan DD/MM/YY (11 Oktober).
 * 2. "2026-10-12" (ISO date-only) di-parse JS sebagai UTC, yang menyebabkan tanggal mundur pada zona waktu tertentu.
 */
export function parseDateToLocal(val: string | Date | undefined | null): Date | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val

  const clean = String(val).trim()
  if (!clean) return null

  // 1. Format ISO: YYYY-MM-DD (dengan atau tanpa jam / time)
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
  }

  // 2. Format Klinis: DD/MM/YYYY atau DD/MM/YY (separator '/', '-', '.')
  const dmyMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch
    let fullYear = parseInt(y, 10)
    if (y.length === 2) {
      fullYear = fullYear < 70 ? 2000 + fullYear : 1900 + fullYear
    }
    const dayNum = parseInt(d, 10)
    const monthNum = parseInt(m, 10)
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return new Date(fullYear, monthNum - 1, dayNum)
    }
  }

  // 3. Format teks angka tanpa separator (6 digit: DDMMYY atau 8 digit: DDMMYYYY)
  const digitMatch = clean.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/)
  if (digitMatch) {
    let [, d, m, y] = digitMatch
    let fullYear = parseInt(y, 10)
    if (y.length === 2) {
      fullYear = fullYear < 70 ? 2000 + fullYear : 1900 + fullYear
    }
    const dayNum = parseInt(d, 10)
    const monthNum = parseInt(m, 10)
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return new Date(fullYear, monthNum - 1, dayNum)
    }
  }

  // 4. Fallback bawaan JS
  const fallback = new Date(clean)
  return isNaN(fallback.getTime()) ? null : fallback
}

export function formatDate(isoOrDate: string | Date | undefined | null, customFmt?: DateFormat): string {
  if (!isoOrDate) return '—'
  const d = parseDateToLocal(isoOrDate)
  if (!d || isNaN(d.getTime())) return String(isoOrDate)

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
  const target = parseDateToLocal(isoOrDate)
  if (!target || isNaN(target.getTime())) return 1

  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()

  const diffDays = Math.floor((todayMidnight - targetMidnight) / 86400000)
  return Math.max(1, diffDays + 1)
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
 * Konversi tanggal ISO (YYYY-MM-DD), Date, atau input teks lain ke tampilan seragam DD/MM/YY.
 */
export function toDisplayDate(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return ''
  const d = parseDateToLocal(isoOrDate)
  if (!d || isNaN(d.getTime())) return String(isoOrDate)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const shortYear = String(d.getFullYear()).slice(-2)
  return `${day}/${month}/${shortYear}`
}

/**
 * Konversi input teks DD/MM/YY, DD/MM/YYYY, atau YYYY-MM-DD ke format baku ISO (YYYY-MM-DD).
 */
export function parseToIsoDate(text: string): string | null {
  if (!text) return null
  const d = parseDateToLocal(text)
  if (!d || isNaN(d.getTime())) return null
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
