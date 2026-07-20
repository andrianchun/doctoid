import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'

/* Nama/No.RM tersensor default; ketuk → biometrik → unmask global sesi ini; ketuk lagi → sensor lagi */
export default function Masked({ value, type = 'rm', className = '' }: { value: string; type?: 'name' | 'rm'; className?: string }) {
  const { unmasked, setUnmasked } = useUi()
  const toggle = async () => {
    if (unmasked) return setUnmasked(false)
    if (await verifyBiometric()) setUnmasked(true)
  }
  
  let maskedValue = '•••'
  if (type === 'name' && value) {
    maskedValue = value.substring(0, 1).toUpperCase() + '***'
  }

  return (
    <button
      onClick={toggle}
      title={unmasked ? 'Ketuk untuk sensor' : 'Ketuk untuk buka (biometrik)'}
      className={`cursor-pointer select-none ${unmasked ? '' : 'tracking-widest text-ink-muted'} ${className}`}
    >
      {unmasked ? value : maskedValue}
    </button>
  )
}
