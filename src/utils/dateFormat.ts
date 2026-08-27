export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD MMM YYYY'
export type TimeFormat = '24h' | '12h'

export function getStoredDateFormat(): DateFormat {
  return (localStorage.getItem('doctoid_date_format') as DateFormat) || 'DD/MM/YYYY'
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

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
  const monthName = MONTHS_SHORT[d.getMonth()]

  switch (fmt) {
    case 'YYYY-MM-DD':
      return `${year}-${monthNum}-${day}`
    case 'DD MMM YYYY':
      return `${day} ${monthName} ${year}`
    case 'DD/MM/YYYY':
    default:
      return `${day}/${monthNum}/${year}`
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
