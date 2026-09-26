import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'

/* Nama/No.RM tersensor default; sensor dikendalikan tombol dedicated agar tidak tertukar dengan klik kartu */
export default function Masked({
  value,
  type = 'rm',
  className = '',
  clickable = false,
}: {
  value: string
  type?: 'name' | 'rm'
  className?: string
  clickable?: boolean
}) {
  const { unmasked, setUnmasked } = useUi()
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (unmasked) return setUnmasked(false)
    if (await verifyBiometric()) setUnmasked(true)
  }

  let maskedValue = '•••'
  if (type === 'name' && value) {
    maskedValue = value.substring(0, 1).toUpperCase() + '***'
  } else if (type === 'rm' && value) {
    const clean = value.trim()
    maskedValue = clean.length > 3 ? clean.substring(0, 3) + '***' : clean.substring(0, 1) + '***'
  }

  if (clickable) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={unmasked ? 'Ketuk untuk sensor' : 'Ketuk untuk buka (biometrik)'}
        className={`cursor-pointer select-none ${unmasked ? '' : 'text-ink-muted'} ${className}`}
      >
        {unmasked ? value : maskedValue}
      </button>
    )
  }

  return (
    <span
      className={`select-none ${unmasked ? '' : 'text-ink-muted'} ${className}`}
    >
      {unmasked ? value : maskedValue}
    </span>
  )
}
