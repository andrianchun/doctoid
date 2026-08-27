import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Camera, LogOut } from 'lucide-react'
import { useUi } from '../store'
import { logoutUser, saveUserProfileCloud, getDoctorSpecialty, type UserProfile } from '../auth'
import { convertToWebP } from '../utils/mediaCompress'

export interface SpecialtyGroup {
  category: string
  roles: string[]
}

export const SPECIALTY_GROUPS: SpecialtyGroup[] = [
  {
    category: 'Umum & Jenjang Pendidikan',
    roles: [
      'Koas (Co-Assistant)',
      'Internsip',
      'Umum (General Practitioner)',
      'Residen / PPDS Neurologi',
      'Residen / PPDS Penyakit Dalam',
      'Residen / PPDS Bedah',
      'Residen / PPDS Anak',
      'Residen / PPDS Obgyn',
      'Residen / PPDS Anestesi',
      'Residen / PPDS Lainnya',
    ],
  },
  {
    category: 'Spesialis Medikal & Saraf',
    roles: [
      'Spesialis Neurologi / Saraf (Sp.N)',
      'Spesialis Penyakit Dalam (Sp.PD)',
      'Spesialis Jantung & Pembuluh Darah (Sp.JP)',
      'Spesialis Paru / Pulmonologi (Sp.P)',
      'Spesialis Anak / Pediatri (Sp.A)',
      'Spesialis Kedokteran Jiwa / Psikiatri (Sp.KJ)',
      'Spesialis Kulit & Kelamin / Dermatologi (Sp.DVE)',
      'Spesialis Kedokteran Fisik & Rehabilitasi (Sp.KFR)',
      'Spesialis Gizi Klinik (Sp.GK)',
      'Spesialis Farmakologi Klinik (Sp.FK)',
    ],
  },
  {
    category: 'Spesialis Bedah & Prosedural',
    roles: [
      'Spesialis Bedah Umum (Sp.B)',
      'Spesialis Bedah Saraf (Sp.BS)',
      'Spesialis Bedah Ortopedi & Traumatologi (Sp.OT)',
      'Spesialis Bedah Urologi (Sp.U)',
      'Spesialis Bedah Anak (Sp.BA)',
      'Spesialis Bedah Plastik & Rekonstruksi (Sp.BP-RE)',
      'Spesialis Bedah Toraks, Kardiak & Vaskular (Sp.BTKV)',
      'Spesialis Obstetri & Ginekologi (Sp.OG)',
      'Spesialis Mata / Oftalmologi (Sp.M)',
      'Spesialis THT-BKL (Sp.THT-BKL)',
      'Spesialis Anestesiologi & Terapi Intensif (Sp.An-TI)',
    ],
  },
  {
    category: 'Spesialis Penunjang & Diagnostik',
    roles: [
      'Spesialis Radiologi (Sp.Rad)',
      'Spesialis Patologi Klinik (Sp.PK)',
      'Spesialis Patologi Anatomi (Sp.PA)',
      'Spesialis Mikrobiologi Klinik (Sp.MK)',
      'Spesialis Parasitologi Klinik (Sp.ParK)',
      'Spesialis Kedokteran Forensik & Medikolegal (Sp.FM)',
      'Spesialis Kedokteran Nuklir (Sp.KN)',
      'Spesialis Kedokteran Emergensi (Sp.Em)',
      'Spesialis Kedokteran Okupasi (Sp.Ok)',
      'Spesialis Kedokteran Olahraga (Sp.KO)',
      'Spesialis Akupunktur Medik (Sp.Ak)',
    ],
  },
  {
    category: 'Subspesialis & Konsultan',
    roles: [
      'Subspesialis / Konsultan Neurologi (Sp.N(K))',
      'Subspesialis / Konsultan Penyakit Dalam (Sp.PD-K...)',
      'Subspesialis / Konsultan Bedah (Sp.B(K)...)',
      'Subspesialis / Konsultan Anak (Sp.A(K))',
      'Subspesialis / Konsultan Lainnya',
    ],
  },
  {
    category: 'Kustom',
    roles: ['Lainnya (Kustom)'],
  },
]

const ALL_ROLES = SPECIALTY_GROUPS.flatMap((g) => g.roles)

export default function DoctorProfile() {
  const navigate = useNavigate()
  const { user, setUser, setIsUnlocked } = useUi()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initialSpecialty = user?.specialty || getDoctorSpecialty()
  const isPreset = ALL_ROLES.includes(initialSpecialty)

  const [name, setName] = useState(user?.displayName || 'Dokter')
  const [selectedPreset, setSelectedPreset] = useState(isPreset ? initialSpecialty : 'Lainnya (Kustom)')
  const [customSpecialty, setCustomSpecialty] = useState(isPreset ? '' : initialSpecialty)
  const [photoUrl, setPhotoUrl] = useState(user?.photoURL || '')
  const [toast, setToast] = useState('')
  const [saved, setSaved] = useState(false)

  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3000)
  }

  const handleSaveProfile = async () => {
    if (!name.trim()) return notify('Nama dokter tidak boleh kosong.')

    const finalSpecialty =
      selectedPreset === 'Lainnya (Kustom)'
        ? customSpecialty.trim() || 'Spesialis Neurologi / Saraf (Sp.N)'
        : selectedPreset

    const updated: UserProfile = {
      uid: user?.uid || 'local',
      email: user?.email || null,
      displayName: name.trim(),
      photoURL: photoUrl || null,
      specialty: finalSpecialty,
    }
    setUser(updated)
    await saveUserProfileCloud(updated)

    setSaved(true)
    notify('Profil tersimpan ✓')
    setTimeout(() => setSaved(false), 2500)
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // 1. Konversi ke WebP
      const webpDataUrl = await convertToWebP(file, 512, 0.85)
      setPhotoUrl(webpDataUrl)

      const finalSpecialty =
        selectedPreset === 'Lainnya (Kustom)'
          ? customSpecialty.trim() || 'Spesialis Neurologi / Saraf (Sp.N)'
          : selectedPreset

      // 2. Simpan instan ke state, localStorage, & cloud
      const updated: UserProfile = {
        uid: user?.uid || 'local',
        email: user?.email || null,
        displayName: name.trim() || user?.displayName || 'Dokter',
        photoURL: webpDataUrl,
        specialty: finalSpecialty,
      }
      setUser(updated)
      await saveUserProfileCloud(updated)

      notify('Foto profil diperbarui ✓')
    } catch {
      notify('Gagal memproses foto profil.')
    }
  }

  const handleLogout = async () => {
    if (window.confirm('Apakah Dokter yakin ingin keluar dari akun ini?')) {
      await logoutUser()
      setUser(null)
      setIsUnlocked(false)
      navigate('/dasbor')
    }
  }

  return (
    <main className="space-y-5 p-5 pb-36">
      {/* Header Halaman */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Kembali"
          className="flex size-11 items-center justify-center rounded-2xl glass-card text-ink-muted hover:text-ink active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="glass-blue-hero rounded-3xl px-5 py-4 text-white shadow-xl flex-1">
          <h1 className="h1 text-2xl font-black text-white">Profil Dokter</h1>
        </div>
      </div>

      {/* Card Form */}
      <div className="glass-card rounded-3xl p-6 shadow-sm space-y-5">
        {/* Foto Profil */}
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="relative">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={name}
                className="size-24 rounded-3xl object-cover ring-4 ring-primary/20 shadow-lg"
              />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-deep text-white font-black text-3xl shadow-lg ring-4 ring-primary/20">
                {name?.[0]?.toUpperCase() || 'D'}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Ganti Foto"
              className="absolute -bottom-1.5 -right-1.5 flex size-9 items-center justify-center rounded-2xl bg-primary text-white shadow-md hover:bg-primary-deep active:scale-95 transition-all cursor-pointer ring-2 ring-white"
            >
              <Camera size={16} />
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              className="hidden"
            />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            Ganti Foto
          </button>
        </div>

        {/* Input Form */}
        <div className="space-y-4 pt-2 border-t border-surface">
          {/* Nama Dokter */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">
              Nama Lengkap & Gelar
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="dr. Nama Dokter, Gelar"
              className="w-full rounded-2xl border border-surface bg-surface/80 px-4 py-3 text-xs font-bold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Spesialisasi / Peran Dokter (Dropdown Lengkap dengan Kategori Optgroup) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">
              Peran / Spesialisasi
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="w-full rounded-2xl border border-surface bg-surface/80 px-4 py-3 text-xs font-bold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
            >
              {SPECIALTY_GROUPS.map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedPreset === 'Lainnya (Kustom)' && (
              <input
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
                placeholder="Ketik spesialisasi dokter..."
                className="w-full rounded-2xl border border-surface bg-surface/80 px-4 py-3 text-xs font-bold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all mt-2"
              />
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">
              Email Akun
            </label>
            <div className="rounded-2xl border border-surface bg-surface/40 px-4 py-3 text-xs font-medium text-ink-muted truncate">
              {user?.email || '—'}
            </div>
          </div>

          {/* Tombol Simpan */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSaveProfile}
              className="w-full flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-5 py-3.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              {saved ? 'Tersimpan' : 'Simpan'}
            </button>
          </div>
        </div>

        {/* Tombol Keluar */}
        <div className="pt-2 border-t border-surface">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3.5 text-xs transition-all border border-red-200/50 cursor-pointer active:scale-95 shadow-xs"
          >
            <LogOut size={16} />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
