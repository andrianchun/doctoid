import { normalizePenunjangText } from '../utils/penunjangNormalizer'

/**
 * Membersihkan penulisan teks penunjang agar rapi dan seragam.
 */
export function cleanPenunjangText(raw?: string): string {
  return normalizePenunjangText(raw)
}

const PENUNJANG_HEADER_RE =
  /^\s*(Lab(?:oratorium)?|EKG|ECG|Radiologi(?:\s*-\s*[^:\n]+)?|Penunjang|Lainnya)\s*:\s*(.*)$/i

const STANDALONE_CAT_RE =
  /^\s*(Lab(?:oratorium)?|EKG|ECG|Radiologi(?:\s*-\s*[^:\n]+)?)\s*$/i

function normalizeCategoryLabel(rawLabel: string): string {
  const trimmed = rawLabel.trim().replace(/\bLaboratorium\b/gi, 'Lab')
  if (/^lab$/i.test(trimmed)) return 'Lab'
  if (/^ekg$/i.test(trimmed)) return 'EKG'
  if (/^ecg$/i.test(trimmed)) return 'ECG'
  if (/^radiologi$/i.test(trimmed)) return 'Radiologi'
  if (/^penunjang$/i.test(trimmed)) return 'Penunjang'
  if (/^lainnya$/i.test(trimmed)) return 'Lainnya'
  return trimmed
}

export function FormattedPenunjang({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const normalized = normalizePenunjangText(text)
  if (!normalized) return null

  const lines = normalized.split('\n')

  return (
    <div className={`text-ink font-medium break-words leading-relaxed text-xs ${className}`}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim()
        if (!line) return null

        // 1. Format kurung siku: [Laboratorium]:, [EKG]:, [Radiologi]:, [Radiologi - CT Scan] Kesan: ...
        const bracketMatch = line.match(/^\[([^\]]+)\]\s*:?\s*(.*)$/)
        if (bracketMatch) {
          const label = normalizeCategoryLabel(bracketMatch[1])
          const rest = bracketMatch[2].trim()
          return (
            <div key={idx} className={idx > 0 ? 'mt-1' : undefined}>
              <span className="text-primary italic font-semibold">{label}:</span>
              {rest ? ` ${rest}` : null}
            </div>
          )
        }

        // 2. Format tanpa kurung siku dengan titik dua: Lab:, Laboratorium:, EKG:, Radiologi:
        const headerMatch = line.match(PENUNJANG_HEADER_RE)
        if (headerMatch) {
          const label = normalizeCategoryLabel(headerMatch[1])
          const rest = headerMatch[2].trim()
          return (
            <div key={idx} className={idx > 0 ? 'mt-1' : undefined}>
              <span className="text-primary italic font-semibold">{label}:</span>
              {rest ? ` ${rest}` : null}
            </div>
          )
        }

        // 3. Baris kategori berdiri sendiri tanpa titik dua
        const standaloneMatch = line.match(STANDALONE_CAT_RE)
        if (standaloneMatch) {
          const label = normalizeCategoryLabel(standaloneMatch[1])
          return (
            <div key={idx} className={idx > 0 ? 'mt-1' : undefined}>
              <span className="text-primary italic font-semibold">{label}:</span>
            </div>
          )
        }

        // 4. Baris temuan biasa (- GDA 178 ↑, Skor NIHSS: 19, dll.)
        return <div key={idx}>{rawLine}</div>
      })}
    </div>
  )
}
