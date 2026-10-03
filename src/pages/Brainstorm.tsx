import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { useLiveQuery } from 'dexie-react-hooks'

interface ShareDataPayload {
  text?: string
  images?: { name: string; type: string; dataUrl: string }[]
}

interface ShareReceiverPlugin {
  getPendingShare(): Promise<{ hasShare: boolean; data?: ShareDataPayload }>
  clearPendingShare(): Promise<void>
  addListener(eventName: 'shareReceived', listenerFunc: (data: ShareDataPayload) => void): Promise<any>
}

const ShareReceiver: ShareReceiverPlugin | null = Capacitor.isNativePlatform()
  ? registerPlugin<ShareReceiverPlugin>('ShareReceiver')
  : null
import {
  Mic,
  Trash2, Loader2, X, FileText, ChevronDown, Send,
  Search
} from 'lucide-react'
import { db, type Jaminan, type TerapiItem, type DiagnosisItem, type RegexField, type Patient, type RawatEpisode, type PeranRawat } from '../db'
import { DEPT_ALIH_RAWAT } from './PatientProfile'
import Masked from '../components/Masked'
import ResizableTextarea from '../components/ResizableTextarea'
import AttachmentMenu from '../components/AttachmentMenu'
import CustomSelect from '../components/CustomSelect'
import { lineToTerapi, localParse, classifyFragment, synthesizeRegexRule, isGenderToken, type LocalParseResult } from '../parser'
import { rapikan, analisisKasus } from '../ai'
import { buatKonteks, catatTerapi, saranTerapi, type Suggestion } from '../styleLearning'
import { formatDate, hariKe, getLocalDateString } from '../utils/dateFormat'
import DateInput from '../components/DateInput'
import { useBodyScrollLock } from '../utils/useBodyScrollLock'
import { extractClinicalMetrics } from '../utils/clinicalExtractor'

const today = () => getLocalDateString()

interface StagedAnalysis {
  A: DiagnosisItem[]
  P: TerapiItem[]
  komentar: string
}

interface FormState {
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  jaminan: Jaminan
  tgl_mrs: string
  tgl_onset: string
  peran_rawat: PeranRawat
  dpjp_utama: string
  tim_raber: string[]
  S: string
  O_pemfis: string
  O_penunjang: string
  A: DiagnosisItem[]
  P: TerapiItem[]
}

const emptyForm = (): FormState => ({
  title: '', nama_depan: '', usia: '', no_rm: '', jaminan: 'BPJS', tgl_mrs: today(), tgl_onset: '',
  peran_rawat: 'Leader', dpjp_utama: 'Neuro', tim_raber: [],
  S: '', O_pemfis: '', O_penunjang: '',
  A: [{ kategori: 'Utama', nama_diagnosis: '', icd10: '' }],
  P: [],
})

const inputCls =
  'w-full rounded-2xl border border-slate-300 bg-slate-100/90 px-4 py-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all shadow-2xs'

const textareaCls =
  'w-full min-h-[140px] rounded-2xl border border-slate-300 bg-slate-100/90 p-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all shadow-2xs resize-y leading-relaxed'

const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new globalThis.Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const MAX = 1200
        if (width > height && width > MAX) {
          height *= MAX / width
          width = MAX
        } else if (height > MAX) {
          width *= MAX / height
          height = MAX
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/webp', 0.8))
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}

const fileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

export default function Brainstorm() {
  const navigate = useNavigate()
  const [raw, setRaw] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState<'' | 'ocr' | 'ai' | 'analisis'>('')
  const [listening, setListening] = useState(false)
  const [isTextFocused, setIsTextFocused] = useState(false)
  const [toast, setToast] = useState('')
  const [komentarAnalisis, setKomentarAnalisis] = useState('')

  type Kategori = 'pemfis' | 'penunjang'
  const [attachments, setAttachments] = useState<{ id: string, name: string, type: string, dataUrl: string, kategori: Kategori }[]>([])

  const pemfisAttachRef = useRef<HTMLInputElement>(null)
  const penunjangAttachRef = useRef<HTMLInputElement>(null)

  const ocrCameraRef = useRef<HTMLInputElement>(null)
  const ocrGalleryRef = useRef<HTMLInputElement>(null)

  const textRef = useRef<HTMLTextAreaElement>(null)
  const recRef = useRef<SpeechRecognition | null>(null)
  const namaRef = useRef<HTMLInputElement>(null)
  const faskesRef = useRef<HTMLButtonElement>(null)
  const sRef = useRef<HTMLTextAreaElement>(null)

  const hospitals = useLiveQuery(() => db.hospitals.toArray(), [], [])
  const [hospitalId, setHospitalId] = useState<number>(0)
  const allWards = useLiveQuery(() => db.wards.toArray(), [], [])
  const [wardId, setWardId] = useState<number>(0)
  const regexRules = useLiveQuery(() => db.regexRules.toArray(), [], [])
  const allPatients = useLiveQuery(() => db.patients.toArray(), [], [])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [detectedPatient, setDetectedPatient] = useState<Patient | null>(null)
  const [dismissedPatientId, setDismissedPatientId] = useState<number | null>(null)
  const [showSearchModal, setShowSearchModal] = useState(false)
  useBodyScrollLock(showSearchModal)
  const [patientSearchQ, setPatientSearchQ] = useState('')
  const [stagedAnalysis, setStagedAnalysis] = useState<StagedAnalysis | null>(null)

  const [showFaskesMenu, setShowFaskesMenu] = useState(false)
  const [saranP, setSaranP] = useState<Suggestion[]>([])
  const [highlight, setHighlight] = useState<{ fields: Set<string>; variant: 'amber' | 'red' }>({ fields: new Set(), variant: 'amber' })
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftLoaded = useRef(false)
  const lastParsedRef = useRef<{
    raw: string
    hospitalId?: number
    fields: {
      nama_depan: string
      no_rm: string
      usia: string
    }
  } | null>(null)
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.getElementById('bottom-dock-addon') : null
  )

  useEffect(() => {
    if (!dockSlot) {
      setDockSlot(document.getElementById('bottom-dock-addon'))
    }
  }, [dockSlot])

  // Melebarkan textarea otomatis saat mengetik/fokus (maksimal 6 baris ~145px)
  const adjustTextHeight = useCallback(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    const isExpanded = isTextFocused || raw.length > 0
    const minH = isExpanded ? 70 : 42 // 3 baris saat aktif mengetik / ada teks, 1 baris saat kosong
    const maxH = 145 // Maksimal 6 baris agar ergonomis di layar ponsel
    const nextH = Math.min(Math.max(el.scrollHeight, minH), maxH)
    el.style.height = `${nextH}px`
  }, [isTextFocused, raw])

  useEffect(() => {
    adjustTextHeight()
  }, [adjustTextHeight])

  const isFormFilled = useMemo(() => {
    return Boolean(
      raw.trim() ||
      form.nama_depan.trim() ||
      form.title.trim() ||
      form.usia.trim() ||
      form.no_rm.trim() ||
      form.tgl_onset.trim() ||
      form.S.trim() ||
      form.O_pemfis.trim() ||
      form.O_penunjang.trim() ||
      form.A.some(a => a.nama_diagnosis.trim()) ||
      form.P.some(p => p.nama_item.trim()) ||
      attachments.length > 0 ||
      selectedPatient !== null ||
      hospitalId > 0 ||
      wardId > 0 ||
      stagedAnalysis !== null
    )
  }, [raw, form, attachments, selectedPatient, hospitalId, wardId, stagedAnalysis])

  const notify = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  // variant 'amber' = data baru ditambahkan/di-merge; 'red' = field wajib belum diisi
  const flashHighlight = (fields: string[], variant: 'amber' | 'red' = 'amber') => {
    if (!fields.length) return
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    setHighlight({ fields: new Set(fields), variant })
    highlightTimer.current = setTimeout(() => setHighlight({ fields: new Set(), variant }), 1500)
  }
  const hl = (field: string) => {
    if (!highlight.fields.has(field)) return ' transition-shadow duration-700'
    return highlight.variant === 'red' ? ' ring-2 ring-red-500 transition-shadow duration-700' : ' ring-2 ring-amber-400 transition-shadow duration-700'
  }


  // Draft aktif dipertahankan lintas tab (Dasbor/Rekap/Brainstorm) — dimuat sekali saat mount
  useEffect(() => {
    db.brainstormDraft.get(1).then((d) => {
      if (d) {
        setRaw(d.raw)
        setForm(d.form as FormState)
        setAttachments(d.attachments)
        setHospitalId(d.hospitalId)
        setWardId(d.wardId)
        if (d.readmissionPatientId) {
          db.patients.get(d.readmissionPatientId).then(p => {
            if (p) setSelectedPatient(p)
          })
        }
      }
      draftLoaded.current = true
    })
  }, [])

  const applyIncomingShare = useCallback(
    (data: ShareDataPayload) => {
      if (data.text && data.text.trim()) {
        setRaw((prev) => (prev ? prev + '\n' + data.text!.trim() : data.text!.trim()))
      }
      if (data.images && data.images.length > 0) {
        setAttachments((prev) => [
          ...prev,
          ...data.images!.map((img) => ({
            id: Math.random().toString(36).substring(7),
            name: img.name || 'Foto Lampiran',
            type: img.type || 'image/jpeg',
            dataUrl: img.dataUrl,
            kategori: 'penunjang' as const,
          })),
        ])
      }
      notify('📥 Menerima kiriman berkas/teks dari aplikasi lain (WA/Galeri) ✓')
    },
    []
  )

  useEffect(() => {
    // 1. Cek incoming share dari Android Capacitor Intent (WhatsApp/Galeri)
    if (!ShareReceiver) return
    try {
      ShareReceiver.getPendingShare()
        .then((res) => {
          if (res?.hasShare && res.data) {
            applyIncomingShare(res.data)
          }
        })
        .catch(() => {})

      const handle = ShareReceiver.addListener('shareReceived', (data) => {
        if (data) {
          applyIncomingShare(data)
        }
      })

      return () => {
        handle?.then?.((h: any) => h?.remove?.())
      }
    } catch {}
  }, [applyIncomingShare])

  useEffect(() => {
    // 2. Cek incoming share dari PWA Web Share Target URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const sharedText = urlParams.get('text') || urlParams.get('title')
    if (sharedText) {
      setRaw((prev) => (prev ? prev + '\n' + sharedText : sharedText))
      notify('📥 Menerima teks konsul dari kiriman luar')
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash)
    }
  }, [])

  // Autosave draft (debounced) tiap ada perubahan, supaya pindah tab gak ngilangin isian
  useEffect(() => {
    if (!draftLoaded.current) return
    const t = setTimeout(() => {
      db.brainstormDraft.put({
        id: 1, raw, form, attachments, hospitalId, wardId, readmissionPatientId: selectedPatient?.id ?? null, updated_at: new Date().toISOString(),
      })
    }, 400)
    return () => clearTimeout(t)
  }, [raw, form, attachments, hospitalId, wardId, selectedPatient])

  // Deteksi Pasien Lama Real-time (berdasarkan No. RM atau Nama)
  useEffect(() => {
    if (selectedPatient) {
      setDetectedPatient(null)
      return
    }
    const rm = (form.no_rm || '').trim().toLowerCase()
    const nama = (form.nama_depan || '').trim().toLowerCase()
    if (!rm && (!nama || nama.length < 3)) {
      setDetectedPatient(null)
      return
    }
    if (!allPatients?.length) {
      setDetectedPatient(null)
      return
    }

    const cleanRm = rm.replace(/[^a-z0-9]/gi, '')
    let match: Patient | undefined

    if (cleanRm.length >= 3) {
      match = allPatients.find(p => {
        const pCleanRm = (p.no_rm || '').toLowerCase().replace(/[^a-z0-9]/gi, '')
        return pCleanRm && (pCleanRm === cleanRm || pCleanRm.includes(cleanRm) || cleanRm.includes(pCleanRm))
      })
    }

    if (!match && nama.length >= 3) {
      match = allPatients.find(p => {
        const pNama = (p.nama_depan || '').toLowerCase()
        return pNama && (pNama === nama || pNama.startsWith(nama) || nama.startsWith(pNama))
      })
    }

    if (match && match.id !== dismissedPatientId) {
      setDetectedPatient(match)
    } else {
      setDetectedPatient(null)
    }
  }, [form.no_rm, form.nama_depan, allPatients, selectedPatient, dismissedPatientId])

  const handleSelectExistingPatient = (p: Patient, forceReadmisi = false) => {
    if (p.status_rawat === 'aktif' && !forceReadmisi) {
      setShowSearchModal(false)
      setDetectedPatient(p)
      notify(`Pasien ${p.nama_depan} sedang dirawat aktif. Anda dapat langsung Update CPPT Hari Ini.`)
      return
    }
    setSelectedPatient(p)
    set({
      title: p.title || form.title,
      nama_depan: p.nama_depan || form.nama_depan,
      usia: p.usia || form.usia,
      no_rm: p.no_rm || form.no_rm,
      jaminan: p.jaminan || form.jaminan,
      tgl_mrs: today(),
    })
    if (p.hospital_id && (!hospitalId || hospitalId === 0)) {
      setHospitalId(p.hospital_id)
    }
    setDetectedPatient(null)
    setShowSearchModal(false)
    notify(`Mode Readmisi: ${p.title ? p.title + ' ' : ''}${p.nama_depan} (RM ${p.no_rm})`)
  }

  const handleUpdateActivePatientSoap = async (p: Patient) => {
    if (!p.id) return

    try {
      const todayStr = today()
      const existingTodayNote = await db.progressNotes
        .where('patient_id')
        .equals(p.id)
        .filter((n) => n.tanggal === todayStr)
        .first()

      if (existingTodayNote && existingTodayNote.id) {
        // Gabungkan S (dengan jeda baris jika sudah ada catatan sebelumnya)
        let mergedS = existingTodayNote.S || ''
        if (form.S.trim()) {
          mergedS = mergedS ? `${mergedS}\n\n${form.S.trim()}` : form.S.trim()
        }

        // Gabungkan O Pemfis
        let mergedPemfis = existingTodayNote.O_pemfis || ''
        if (form.O_pemfis.trim()) {
          mergedPemfis = mergedPemfis ? `${mergedPemfis}\n${form.O_pemfis.trim()}` : form.O_pemfis.trim()
        }

        // Gabungkan O Penunjang
        let mergedPenunjang = existingTodayNote.O_penunjang || ''
        if (form.O_penunjang.trim()) {
          mergedPenunjang = mergedPenunjang ? `${mergedPenunjang}\n${form.O_penunjang.trim()}` : form.O_penunjang.trim()
        }

        // Gabungkan A (Diagnosis) tanpa duplikasi nama
        const existingDxNames = new Set(existingTodayNote.A.map((d) => d.nama_diagnosis.trim().toLowerCase()))
        const newDx = form.A.filter((d) => d.nama_diagnosis.trim() && !existingDxNames.has(d.nama_diagnosis.trim().toLowerCase()))
        const mergedA = [...existingTodayNote.A, ...newDx]

        // Gabungkan P (Terapi & Advis) tanpa duplikasi nama
        const existingPNames = new Set(existingTodayNote.P.map((item) => item.nama_item.trim().toLowerCase()))
        const newP = form.P.filter((item) => item.nama_item.trim() && !existingPNames.has(item.nama_item.trim().toLowerCase()))
        const mergedP = [...existingTodayNote.P, ...newP]

        // Gabungkan Lampiran
        const existingAtts = existingTodayNote.attachments || []
        const newAtts = attachments.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl, kategori: a.kategori }))
        const mergedAtts = [...existingAtts, ...newAtts]

        const metrics = extractClinicalMetrics({
          S: mergedS,
          O_pemfis: mergedPemfis,
          O_penunjang: mergedPenunjang,
        })

        await db.progressNotes.update(existingTodayNote.id, {
          S: mergedS,
          O_pemfis: mergedPemfis,
          O_penunjang: mergedPenunjang,
          A: mergedA,
          P: mergedP,
          attachments: mergedAtts,
          metrics,
        })
      } else {
        // Catatan pertama untuk hari ini
        const metrics = extractClinicalMetrics({
          S: form.S.trim(),
          O_pemfis: form.O_pemfis.trim(),
          O_penunjang: form.O_penunjang.trim(),
        })

        await db.progressNotes.add({
          patient_id: p.id,
          tanggal: todayStr,
          S: form.S.trim(),
          O_pemfis: form.O_pemfis.trim(),
          O_penunjang: form.O_penunjang.trim(),
          A: form.A.filter((d) => d.nama_diagnosis.trim()),
          P: form.P,
          attachments: attachments.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl, kategori: a.kategori })),
          metrics,
        })
      }

      // Simpan lampiran penunjang (EKG, Lab, Radiologi) ke tabel db.penunjang
      const penunjangAtts = attachments.filter((a) => a.kategori === 'penunjang')
      for (const att of penunjangAtts) {
        let kat: 'Laboratorium' | 'Radiologi' | 'Lainnya' = 'Lainnya'
        const lower = (att.name + ' ' + form.O_penunjang).toLowerCase()
        if (/ct|mri|rontgen|foto|thorax|xray|radiologi/i.test(lower)) {
          kat = 'Radiologi'
        } else if (/lab|darah|urine|urin|gda|gds|elektrolit|se/i.test(lower)) {
          kat = 'Laboratorium'
        }
        await db.penunjang.add({
          patient_id: p.id,
          tanggal: todayStr,
          kategori: kat,
          nama_pemeriksaan: att.name || (kat === 'Radiologi' ? 'Pemeriksaan Radiologi' : 'Pemeriksaan Penunjang'),
          hasil: form.O_penunjang || 'Terlampir dokumen pemeriksaan',
          status: 'selesai',
          attachments: [{ name: att.name, type: att.type, dataUrl: att.dataUrl }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }

      if (form.P.length > 0) {
        await catatTerapi(
          buatKonteks(form.S, form.A.map((d) => d.nama_diagnosis)),
          form.P.map(({ nama_item, dosis_keterangan, kategori }) => ({ nama_item, dosis_keterangan, kategori })),
        )
      }

      // Pelajari revisi regex bila ada teks mentah
      if (lastParsedRef.current?.raw) {
        const origRaw = lastParsedRef.current.raw
        const origFields = lastParsedRef.current.fields
        const currentNama = form.nama_depan.trim()

        if (
          currentNama &&
          currentNama.length >= 2 &&
          !isGenderToken(currentNama) &&
          currentNama.toLowerCase() !== origFields.nama_depan.toLowerCase()
        ) {
          const rule = synthesizeRegexRule(origRaw, 'nama_depan', currentNama)
          if (rule) {
            await db.regexRules.add({
              field: rule.field,
              pattern: rule.pattern,
              flags: rule.flags,
              hospital_id: p.hospital_id || undefined,
              source: 'user',
              hits: 1,
              created_at: new Date().toISOString(),
            })
          }
        }
        lastParsedRef.current = null
      }

      await db.brainstormDraft.delete(1)
      setRaw('')
      setAttachments([])
      setKomentarAnalisis('')
      setForm(emptyForm())
      setSelectedPatient(null)
      setDetectedPatient(null)
      setHospitalId(0)
      setWardId(0)
      notify(`CPPT hari ini untuk ${p.nama_depan} berhasil diperbarui! ⚡`)
      navigate(`/pasien/${p.id}`)
    } catch (err: any) {
      alert(err?.message || 'Gagal memperbarui CPPT pasien.')
    }
  }

  // Sugesti terapi lokal (belajar dari riwayat kasus serupa, tanpa AI)
  const dxNames = form.A.map((d) => d.nama_diagnosis).join('|')
  const pNames = form.P.map((p) => p.nama_item).join('|')
  useEffect(() => {
    let cancelled = false
    const konteks = buatKonteks(form.S, dxNames.split('|').filter(Boolean))
    saranTerapi(konteks, pNames.split('|').filter(Boolean)).then((s) => {
      if (!cancelled) setSaranP(s)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.S, dxNames, pNames])

  const tambahSaran = (s: Suggestion) => {
    set({
      P: [...form.P, { nama_item: s.nama_item, dosis_keterangan: s.dosis_keterangan, kategori: s.kategori, tgl_mulai: today(), tgl_stop: null, status: 'aktif' }],
    })
    setSaranP((prev) => prev.filter((x) => x.nama_item !== s.nama_item))
  }

  /* ---- Handlers ---- */
  const handleAttachFile = async (file: File, kategori: Kategori) => {
    try {
      let dataUrl: string
      if (file.type.startsWith('image/')) {
        dataUrl = await compressImage(file)
      } else {
        dataUrl = await fileToBase64(file)
      }
      setAttachments(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl,
        kategori,
      }])
    } catch {
      notify('Gagal memproses file.')
    }
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
    const clipData = 'clipboardData' in e ? e.clipboardData : null
    if (!clipData) return

    const items = clipData.items
    const files = clipData.files
    const imageFiles: File[] = []

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
    } else if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          imageFiles.push(files[i])
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      for (const file of imageFiles) {
        await handleAttachFile(file, 'penunjang')
      }
      notify(`📷 ${imageFiles.length} foto disematkan ke Lampiran Penunjang (EKG/Lab/Radiologi) ✓`)
    }
  }, [])

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      handlePaste(e)
    }
    window.addEventListener('paste', onWindowPaste)
    return () => window.removeEventListener('paste', onWindowPaste)
  }, [handlePaste])

  const runOcr = async (file: File) => {
    setBusy('ocr')
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const { data } = await Tesseract.recognize(file, 'ind')
      setRaw((r) => (r ? r + '\n' : '') + data.text.trim())
      notify('Berhasil mengekstrak teks.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy('')
    }
  }

  const handleClearAll = async () => {
    if (window.confirm('Kosongkan semua isian formulir?')) {
      setForm(emptyForm())
      setRaw('')
      setAttachments([])
      setKomentarAnalisis('')
      setStagedAnalysis(null)
      setSelectedPatient(null)
      setDetectedPatient(null)
      setHospitalId(0)
      setWardId(0)
      await db.brainstormDraft.delete(1)
      notify('Formulir berhasil dikosongkan')
    }
  }

  const runAnalisis = async () => {
    setBusy('analisis')
    setStagedAnalysis(null)
    setKomentarAnalisis('')
    try {
      const dataToAnalyze = JSON.stringify({
        S: form.S,
        O_pemfis: form.O_pemfis,
        O_penunjang: form.O_penunjang,
        A: form.A,
        P: form.P
      }, null, 2)
      
      const r = await analisisKasus(dataToAnalyze)
      setStagedAnalysis({
        A: r.A,
        P: r.P.map(p => ({
          ...p,
          tgl_mulai: today(),
          tgl_stop: null,
          status: 'aktif' as const
        })),
        komentar: r.komentar || ''
      })
      notify('Analisis AI selesai. Silakan periksa usulan di bawah tombol Analisis.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy('')
    }
  }

  const handleAnalisisClick = () => {
    if (!form.S.trim() && !form.O_pemfis.trim()) {
      sRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      flashHighlight(['S', 'O_pemfis'], 'red')
      return notify('Isi S atau O Pemeriksaan Fisik dulu sebelum Analisis.')
    }
    runAnalisis()
  }

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return notify('Browser ini tidak mendukung dikte suara.')
    const rec = new SR()
    rec.lang = 'id-ID'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(' ')
      setRaw((r) => (r ? r + ' ' : '') + t.trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  /* ---- parsing ---- */

  // Draft sudah ada isinya → mode "tambah", bukan kasus baru: jangan pernah timpa field yang sudah terisi
  const applyMerge = (data: LocalParseResult) => {
    const changed: string[] = []
    const patch: Partial<FormState> = {}

    ;(['title', 'nama_depan', 'usia', 'no_rm', 'tgl_mrs', 'tgl_onset'] as const).forEach((k) => {
      if (data[k] && !form[k]) { patch[k] = data[k]; changed.push(k) }
    })
    if (data.jaminan && !form.jaminan) { patch.jaminan = data.jaminan; changed.push('jaminan') }

    ;(['S', 'O_pemfis', 'O_penunjang'] as const).forEach((k) => {
      const incoming = data[k].trim()
      if (!incoming) return
      const existing = form[k].trim()
      if (!existing) { patch[k] = incoming; changed.push(k) }
      else if (!existing.includes(incoming)) { patch[k] = existing + '\n' + incoming; changed.push(k) }
    })

    if (data.A.length) {
      const existingNames = new Set(form.A.map((d) => d.nama_diagnosis.toLowerCase().trim()))
      const baru = data.A.filter((d) => d.nama_diagnosis.trim() && !existingNames.has(d.nama_diagnosis.toLowerCase().trim()))
      if (baru.length) { patch.A = [...form.A, ...baru]; changed.push('A') }
    }

    if (data.P.length) {
      const existingItems = new Set(form.P.map((p) => p.nama_item.toLowerCase().trim()))
      const baru = data.P.filter((p) => p.nama_item.trim() && !existingItems.has(p.nama_item.toLowerCase().trim()))
      if (baru.length) { patch.P = [...form.P, ...baru]; changed.push('P') }
    }

    if (Object.keys(patch).length) set(patch)
    flashHighlight(changed)
  }

  // Fragmen tanpa struktur SOAP (mis. "Ureum 100") — tetap tanpa AI, diarahkan ke field yang paling masuk akal
  const applyFragment = (text: string) => {
    const cls = classifyFragment(text)
    if (cls === 'terapi') {
      set({ P: [...form.P, lineToTerapi(text, today())] })
      flashHighlight(['P'])
    } else if (cls === 'penunjang') {
      set({ O_penunjang: form.O_penunjang.trim() ? form.O_penunjang + '\n' + text.trim() : text.trim() })
      flashHighlight(['O_penunjang'])
    } else {
      set({ S: form.S.trim() ? form.S + '\n' + text.trim() : text.trim() })
      flashHighlight(['S'])
    }
  }

  const parseAi = async () => {
    const isDraftAktif = !!form.nama_depan.trim()
    // Fase Hemat Token: coba regex lokal dulu, baru panggil AI jika gagal atau ada lampiran gambar (butuh OCR/vision AI)
    const hasImageAttachment = attachments.some((a) => a.type.startsWith('image/'))
    if (!hasImageAttachment) {
      const { data, success } = localParse(raw, regexRules)
      if (success) {
        const isNamaBeda = !!data.nama_depan && (!form.nama_depan || data.nama_depan.toLowerCase() !== form.nama_depan.toLowerCase())
        const isKasusPenuh = !!data.nama_depan && (!!data.S || !!data.O_pemfis) && (data.A.length > 0 || data.P.length > 0)

        lastParsedRef.current = {
          raw,
          hospitalId: hospitalId || undefined,
          fields: {
            nama_depan: data.nama_depan || '',
            no_rm: data.no_rm || '',
            usia: data.usia || '',
          },
        }

        if (isDraftAktif && !isNamaBeda && !isKasusPenuh) {
          applyMerge(data)
          notify('Data ditambahkan ke form\nSilakan dicek sebelum disimpan')
        } else {
          set({
            title: data.title || (isNamaBeda ? '' : form.title),
            nama_depan: data.nama_depan || form.nama_depan,
            usia: data.usia || (isNamaBeda ? '' : form.usia),
            no_rm: data.no_rm || (isNamaBeda ? '' : form.no_rm),
            jaminan: data.jaminan || form.jaminan || 'BPJS',
            tgl_mrs: data.tgl_mrs || today(),
            tgl_onset: data.tgl_onset || data.tgl_mrs || today(),
            S: data.S,
            O_pemfis: data.O_pemfis,
            O_penunjang: data.O_penunjang,
            A: data.A,
            P: data.P.map((it) => ({ ...it, tgl_mulai: today(), tgl_stop: null, status: 'aktif' as const })),
          })
          notify('Data dimasukkan ke form\nSilakan dicek sebelum disimpan')
        }
        setRaw('')
        return
      }
      // Draft sudah aktif & teks gak berbentuk SOAP penuh → tetap lokal, jangan panggil AI buat fragmen kecil
      if (isDraftAktif && raw.trim()) {
        applyFragment(raw)
        notify('Data ditambahkan ke form\nSilakan dicek sebelum disimpan')
        setRaw('')
        return
      }
    }

    setBusy('ai')
    try {
      const r = await rapikan(raw, attachments, false)
      const tglMrs = r.tgl_mrs || today()
      const tglOnset = r.tgl_onset || tglMrs
      lastParsedRef.current = {
        raw,
        hospitalId: hospitalId || undefined,
        fields: {
          nama_depan: r.nama_depan || '',
          no_rm: r.no_rm || '',
          usia: r.usia || '',
        },
      }
      set({
        ...r,
        jaminan: r.jaminan || 'BPJS',
        tgl_mrs: tglMrs,
        tgl_onset: tglOnset,
        P: r.P.map((it) => ({ ...it, tgl_mulai: today(), tgl_stop: null, status: 'aktif' as const })),
      })
      await simpanRegexBaru(r.regex_baru)
      setRaw('')
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  /* Kamus Regex Lokal: simpan pola baru yang diajarkan AI agar teks serupa berikutnya diparsing gratis */
  const simpanRegexBaru = async (rules?: { field: RegexField; pattern: string; flags: string }[]) => {
    if (!rules?.length) return
    const existing = regexRules ?? []
    for (const r of rules) {
      if (!r.field || !r.pattern) continue
      try {
        new RegExp(r.pattern, r.flags) // validasi sintaks
      } catch {
        continue
      }
      const dup = existing.some((e) => e.field === r.field && e.pattern === r.pattern)
      if (dup) continue
      await db.regexRules.add({ ...r, hospital_id: hospitalId || undefined, source: 'ai', hits: 0, created_at: new Date().toISOString() })
    }
  }

  /* ---- simpan ---- */
  const scrollToInvalid = (el: HTMLElement | null, field: string) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashHighlight([field], 'red')
  }

  const filteredPatients = useMemo(() => {
    if (!allPatients) return []
    const q = patientSearchQ.trim().toLowerCase()
    if (!q) return allPatients
    return allPatients.filter((p) =>
      [p.nama_depan, (p as any).inisial, p.no_rm, p.diagnosis_utama, p.jaminan].some(
        (v) => v && v.toLowerCase().includes(q)
      )
    )
  }, [allPatients, patientSearchQ])

  const simpan = async () => {
    if (!form.nama_depan.trim()) {
      scrollToInvalid(namaRef.current, 'nama_depan')
      return notify('Nama depan pasien wajib diisi.')
    }
    if (!hospitalId || !wardId) {
      scrollToInvalid(faskesRef.current, 'faskes')
      return notify('Pilih RS dan ruangan dulu (tambah di Pengaturan bila kosong).')
    }

    // Cari diagnosis utama dari A
    const dxUtama = form.A.find(d => d.kategori === 'Utama')?.nama_diagnosis || form.A[0]?.nama_diagnosis || ''
    
    let targetPatientId: number
    let patientToUse = selectedPatient

    if (!patientToUse && detectedPatient && detectedPatient.status_rawat === 'krs') {
      const keluarLabel = detectedPatient.keterangan_krs === 'Meninggal'
        ? 'MD'
        : detectedPatient.keterangan_krs === 'APS'
        ? 'APS'
        : detectedPatient.keterangan_krs === 'Alih Rawat'
        ? 'Alih Rawat'
        : detectedPatient.keterangan_krs === 'Rujuk'
        ? 'Rujuk'
        : 'KRS'
      const confirmReadmission = window.confirm(
        `Pasien ${detectedPatient.title || ''} ${detectedPatient.nama_depan} (No. RM: ${detectedPatient.no_rm}) sudah ada di Rekam Medis (Status: ${keluarLabel}).\n\nApakah ini episode RAWAT INAP BARU (Readmisi)?\n\n• Klik OK untuk menghubungkan rekam medis dan arsipkan riwayat rawat sebelumnya.\n• Klik Batal untuk membuat data pasien baru terpisah.`
      )
      if (confirmReadmission) {
        patientToUse = detectedPatient
        setSelectedPatient(detectedPatient)
      }
    }

    if (patientToUse && patientToUse.id) {
      targetPatientId = patientToUse.id
      // Arsipkan episode rawat sebelumnya jika ada data tgl_mrs lama
      const previousEpisode: RawatEpisode = {
        id: crypto.randomUUID(),
        tgl_mrs: patientToUse.tgl_mrs,
        tgl_krs: patientToUse.tgl_krs || (patientToUse.status_rawat === 'krs' ? today() : undefined),
        hospital_id: patientToUse.hospital_id,
        ward_id: patientToUse.lokasi_sekarang,
        diagnosis_utama: patientToUse.diagnosis_utama,
        keterangan_krs: patientToUse.keterangan_krs,
        detail_krs: patientToUse.detail_krs,
      }
      const existingHistory = patientToUse.riwayat_rawat || []
      const isAlreadyArchived = existingHistory.some(
        e => e.tgl_mrs === patientToUse.tgl_mrs && e.diagnosis_utama === patientToUse.diagnosis_utama
      )
      const updatedHistory = isAlreadyArchived ? existingHistory : [...existingHistory, previousEpisode]

      const wardCount = await db.patients
        .where('lokasi_sekarang')
        .equals(wardId)
        .filter((p) => p.status_rawat === 'aktif')
        .count()

      await db.patients.update(patientToUse.id, {
        hospital_id: hospitalId,
        title: form.title,
        nama_depan: form.nama_depan.trim(),
        usia: form.usia.trim(),
        no_rm: form.no_rm.trim(),
        tgl_mrs: form.tgl_mrs,
        tgl_onset: form.tgl_onset,
        tgl_krs: undefined,
        keterangan_krs: undefined,
        detail_krs: undefined,
        diagnosis_utama: dxUtama.trim(),
        lokasi_sekarang: wardId,
        status_rawat: 'aktif',
        jaminan: form.jaminan,
        peran_rawat: form.peran_rawat || 'Leader',
        dpjp_utama: form.dpjp_utama || 'Neuro',
        tim_raber: form.tim_raber || [],
        riwayat_rawat: updatedHistory,
        order: wardCount + 1,
      })
    } else {
      const wardCount = await db.patients
        .where('lokasi_sekarang')
        .equals(wardId)
        .filter((p) => p.status_rawat === 'aktif')
        .count()

      targetPatientId = await db.patients.add({
        hospital_id: hospitalId,
        title: form.title,
        nama_depan: form.nama_depan.trim(),
        usia: form.usia.trim(),
        no_rm: form.no_rm.trim(),
        tgl_mrs: form.tgl_mrs,
        tgl_onset: form.tgl_onset,
        diagnosis_utama: dxUtama.trim(),
        lokasi_sekarang: wardId,
        status_rawat: 'aktif',
        jaminan: form.jaminan,
        peran_rawat: form.peran_rawat || 'Leader',
        dpjp_utama: form.dpjp_utama || 'Neuro',
        tim_raber: form.tim_raber || [],
        order: wardCount + 1,
      }) as number
    }

    const metrics = extractClinicalMetrics({
      S: form.S,
      O_pemfis: form.O_pemfis,
      O_penunjang: form.O_penunjang,
    })

    await db.progressNotes.add({
      patient_id: targetPatientId,
      tanggal: today(),
      S: form.S, O_pemfis: form.O_pemfis, O_penunjang: form.O_penunjang, A: form.A, P: form.P,
      attachments: attachments.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl, kategori: a.kategori })),
      metrics,
    })

    // Simpan lampiran penunjang (EKG, Lab, Radiologi) ke tabel penunjang agar tertata rapi di tab Rekam Medis
    const penunjangAtts = attachments.filter(a => a.kategori === 'penunjang')
    for (const att of penunjangAtts) {
      let kat: 'Laboratorium' | 'Radiologi' | 'Lainnya' = 'Lainnya'
      const lower = (att.name + ' ' + form.O_penunjang).toLowerCase()
      if (/ct|mri|rontgen|foto|thorax|xray|radiologi/i.test(lower)) {
        kat = 'Radiologi'
      } else if (/lab|darah|urine|urin|gda|gds|elektrolit|se/i.test(lower)) {
        kat = 'Laboratorium'
      }
      await db.penunjang.add({
        patient_id: targetPatientId,
        tanggal: today(),
        kategori: kat,
        nama_pemeriksaan: att.name || (kat === 'Radiologi' ? 'Pemeriksaan Radiologi' : 'Pemeriksaan Penunjang'),
        hasil: form.O_penunjang || 'Terlampir dokumen pemeriksaan',
        status: 'selesai',
        attachments: [{ name: att.name, type: att.type, dataUrl: att.dataUrl }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    await catatTerapi(
      buatKonteks(form.S, form.A.map((d) => d.nama_diagnosis)),
      form.P.map(({ nama_item, dosis_keterangan, kategori }) => ({ nama_item, dosis_keterangan, kategori })),
    )

    // Cek dan pelajari pola ketikan IGD jika dokter merevisi isian form manual
    let learnedNewRule = false
    if (lastParsedRef.current?.raw) {
      const origRaw = lastParsedRef.current.raw
      const origFields = lastParsedRef.current.fields
      const currentNama = form.nama_depan.trim()
      const currentRm = form.no_rm.trim()
      const currentUsia = form.usia.trim()

      const learnedRulesToSave: { field: RegexField; pattern: string; flags: string }[] = []

      // A. Cek revisi nama
      if (
        currentNama &&
        currentNama.length >= 2 &&
        !isGenderToken(currentNama) &&
        currentNama.toLowerCase() !== origFields.nama_depan.toLowerCase()
      ) {
        const rule = synthesizeRegexRule(origRaw, 'nama_depan', currentNama)
        if (rule) learnedRulesToSave.push(rule)
      }

      // B. Cek revisi No. RM
      if (currentRm && currentRm.length >= 4 && currentRm !== origFields.no_rm) {
        const rule = synthesizeRegexRule(origRaw, 'no_rm', currentRm)
        if (rule) learnedRulesToSave.push(rule)
      }

      // C. Cek revisi Usia
      if (currentUsia && currentUsia !== origFields.usia) {
        const numOnly = currentUsia.match(/\d+/)
        if (numOnly) {
          const rule = synthesizeRegexRule(origRaw, 'usia', numOnly[0])
          if (rule) learnedRulesToSave.push(rule)
        }
      }

      if (learnedRulesToSave.length > 0) {
        for (const r of learnedRulesToSave) {
          const dup = (regexRules ?? []).some(
            (e) => e.field === r.field && e.pattern === r.pattern
          )
          if (!dup) {
            await db.regexRules.add({
              field: r.field,
              pattern: r.pattern,
              flags: r.flags,
              hospital_id: hospitalId || undefined,
              source: 'user',
              hits: 1,
              created_at: new Date().toISOString(),
            })
            learnedNewRule = true
          }
        }
      }
    }
    lastParsedRef.current = null

    await db.brainstormDraft.delete(1)
    setRaw('')
    setAttachments([])
    setKomentarAnalisis('')
    setForm(emptyForm())
    setSelectedPatient(null)
    setDetectedPatient(null)
    // Faskes & ruangan sengaja dikosongkan lagi tiap pasien baru — cegah salah kamar kalau lupa ganti
    setHospitalId(0)
    setWardId(0)
    const learnTag = learnedNewRule ? ' (Pola IGD dipelajari ✓)' : ''
    notify(selectedPatient ? `Readmisi pasien tersimpan & riwayat tersambung 🎉${learnTag}` : `Pasien baru tersimpan 🎉${learnTag}`)
  }

  return (
    <>
    <main className="space-y-5 p-5 pb-36">

      {/* Banner Utama — 1 Baris */}
      <div className="glass-blue-hero rounded-3xl px-5 py-4 text-white shadow-xl flex items-center justify-between">
        <h1 className="h1 text-2xl font-black text-white">Catat Pasien</h1>
        {isFormFilled && (
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-95 px-3 py-1.5 text-xs font-bold text-white transition-all cursor-pointer border border-rose-400/40 shadow-sm shadow-rose-950/20 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200"
            title="Kosongkan seluruh isian formulir"
          >
            <Trash2 size={13} />
            Hapus
          </button>
        )}
      </div>

      {/* Banner Deteksi Pasien Lama / Aktif Realtime */}
      {detectedPatient && !selectedPatient && (
        <div className={`glass-card rounded-3xl border p-4 shadow-lg animate-in fade-in slide-in-from-top-2 ${
          detectedPatient.status_rawat === 'aktif'
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-primary-soft/40'
        }`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`inline-block size-2 rounded-full ${detectedPatient.status_rawat === 'aktif' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <p className="text-xs font-bold text-ink">
                {detectedPatient.status_rawat === 'aktif'
                  ? 'Pasien Sedang Dirawat Aktif di Bangsal'
                  : `Pasien Lama Terdeteksi (${detectedPatient.keterangan_krs === 'Meninggal' ? 'MD' : detectedPatient.keterangan_krs === 'APS' ? 'APS' : detectedPatient.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : detectedPatient.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'})`}
              </p>
            </div>
            <p className="caption text-ink-muted mt-1">
              Ditemukan data <b>{detectedPatient.title} <Masked value={detectedPatient.nama_depan} type="name" /></b> (RM: <Masked value={detectedPatient.no_rm} type="rm" />)
            </p>
            <p className="caption text-ink-muted">
              {detectedPatient.status_rawat === 'aktif'
                ? `Dirawat sejak: ${formatDate(detectedPatient.tgl_mrs)} · Dx: ${detectedPatient.diagnosis_utama || '-'}`
                : `Status: ${detectedPatient.keterangan_krs === 'Meninggal' ? 'MD' : detectedPatient.keterangan_krs === 'APS' ? 'APS' : detectedPatient.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : detectedPatient.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'}${detectedPatient.tgl_krs ? ` pada ${formatDate(detectedPatient.tgl_krs)}` : ''}${detectedPatient.detail_krs ? ` (${detectedPatient.detail_krs})` : ''} · MRS Sebelumnya: ${formatDate(detectedPatient.tgl_mrs)} · Dx Lalu: ${detectedPatient.diagnosis_utama || '-'}`
              }
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {detectedPatient.status_rawat === 'aktif' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleUpdateActivePatientSoap(detectedPatient)}
                    className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-700/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>⚡</span>
                    Update CPPT Hari Ini ({detectedPatient.nama_depan})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectExistingPatient(detectedPatient, true)}
                    className="rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface/80 active:scale-95 transition-all cursor-pointer"
                  >
                    Jadikan Readmisi Baru
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSelectExistingPatient(detectedPatient)}
                  className="rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  Jadikan Readmisi (Rawat Lagi)
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDismissedPatientId(detectedPatient.id!)
                  setDetectedPatient(null)
                }}
                className="rounded-xl bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface/80 active:scale-95 transition-all cursor-pointer"
              >
                Abaikan (Pasien Baru)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indikator Mode Readmisi */}
      {selectedPatient && (
        <div className="rounded-3xl border border-amber-300/40 bg-amber-500/20 backdrop-blur-sm p-4 text-white animate-in fade-in slide-in-from-top-1 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-amber-200">
                Mode Readmisi (Rawat Inap Baru)
              </p>
              <p className="mt-0.5 text-xs text-white/90 truncate">
                Menyambung riwayat: <b>{selectedPatient.title} {selectedPatient.nama_depan}</b> · RM: <Masked value={selectedPatient.no_rm} type="rm" />
              </p>
              <p className="caption text-white/70 mt-0.5">
                Rawat sebelumnya: {formatDate(selectedPatient.tgl_mrs)} {selectedPatient.diagnosis_utama ? `(${selectedPatient.diagnosis_utama})` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPatient(null)
                notify('Beralih ke mode Pasien Baru')
              }}
              className="caption font-bold rounded-xl bg-white/20 hover:bg-white/30 px-3 py-1.5 text-white shrink-0 border border-white/20 transition-colors cursor-pointer"
            >
              Lepas
            </button>
          </div>
        </div>
      )}

      {/* KARTU 1: IDENTITAS & LOKASI PASIEN */}
      <div className={`glass-card rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 border border-slate-300/80 relative transition-all ${showFaskesMenu ? 'z-30' : 'z-10'}`}>
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            {selectedPatient ? 'Identitas Pasien (Readmisi)' : 'Identitas Pasien'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setPatientSearchQ('')
              setShowSearchModal(true)
            }}
            className="text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            Cari Pasien Lama
          </button>
        </div>

        {/* Baris 1: Gelar, Nama, Usia */}
        <div className="flex gap-2">
          <CustomSelect
            value={form.title}
            onChange={(val) => set({ title: val })}
            options={['dr.', 'Tn.', 'Ny.', 'Sdr.', 'Sdri.', 'An.', 'By.']}
            placeholder="Gelar"
            className="w-24 shrink-0"
          />
          <input
            ref={namaRef}
            value={form.nama_depan}
            onChange={(e) => set({ nama_depan: e.target.value })}
            placeholder="Nama"
            className={inputCls + ' flex-1 min-w-0' + hl('nama_depan')}
          />
          <div className="relative w-20 shrink-0">
            <input
              value={form.usia.replace(/\s*thn?|\s*tahun/gi, '')}
              onChange={(e) => {
                const val = e.target.value.replace(/\s*thn?|\s*tahun/gi, '').trim()
                set({ usia: val ? `${val} th` : '' })
              }}
              placeholder="Usia"
              className={inputCls + ' text-center' + (form.usia ? ' pr-6' : '')}
            />
            {form.usia && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted pointer-events-none">
                th
              </span>
            )}
          </div>
        </div>

        {/* Baris 2: No. RM & Jaminan */}
        <div className="grid grid-cols-2 gap-2">
          <input
            value={form.no_rm}
            onChange={(e) => set({ no_rm: e.target.value })}
            placeholder="No. RM"
            className={inputCls}
          />
          <CustomSelect
            value={form.jaminan}
            onChange={(val) => set({ jaminan: val as Jaminan })}
            options={['BPJS', 'Umum', 'Asuransi']}
            placeholder="Pilih Jaminan"
          />
        </div>

        {/* Baris Peran Rawat: Leader, Raber, Konsul */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700">Peran Rawat</label>
            {form.peran_rawat !== 'Leader' && (
              <span className="text-[11px] font-semibold text-indigo-700">
                Leader: {form.dpjp_utama}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['Leader', 'Raber', 'Konsul'] as PeranRawat[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  set({
                    peran_rawat: role,
                    dpjp_utama: role === 'Leader' ? 'Neuro' : form.dpjp_utama === 'Neuro' ? 'IPD' : form.dpjp_utama,
                  })
                }}
                className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  form.peran_rawat === role
                    ? role === 'Leader'
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : role === 'Raber'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {/* Jika Raber atau Konsul, pilih DPJP Utama */}
          {form.peran_rawat !== 'Leader' && (
            <div className="mt-2 animate-in fade-in">
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                {form.peran_rawat === 'Raber' ? 'DPJP Utama (Leader)' : 'Konsul dari (Leader)'}
              </label>
              <select
                value={form.dpjp_utama}
                onChange={(e) => set({ dpjp_utama: e.target.value })}
                className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs bg-white text-ink font-semibold outline-none focus:border-primary shadow-2xs"
              >
                {DEPT_ALIH_RAWAT.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Baris 3: Tgl Onset & Tgl MRS */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">Tgl Onset</label>
              {form.tgl_onset && (
                <span className="caption text-xs font-extrabold text-amber-900 bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-md shadow-2xs">
                  OH-{hariKe(form.tgl_onset)}
                </span>
              )}
            </div>
            <DateInput
              value={form.tgl_onset}
              onChange={(val) => set({ tgl_onset: val })}
              className={inputCls}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">Tgl MRS</label>
              {form.tgl_mrs && (
                <span className="caption text-xs font-extrabold text-emerald-900 bg-emerald-100 border border-emerald-300/80 px-2 py-0.5 rounded-md shadow-2xs">
                  P-{hariKe(form.tgl_mrs)}
                </span>
              )}
            </div>
            <DateInput
              value={form.tgl_mrs}
              onChange={(val) => set({ tgl_mrs: val })}
              className={inputCls}
            />
          </div>
        </div>

        {/* Baris 4: Faskes & Ruangan */}
        <div className="relative">
          <button
            ref={faskesRef}
            type="button"
            onClick={() => setShowFaskesMenu(!showFaskesMenu)}
            className={inputCls + ' flex items-center justify-between text-left cursor-pointer' + hl('faskes')}
          >
            {hospitalId && wardId && hospitals && allWards ? (() => {
               const h = hospitals.find(x => x.id === hospitalId)
               const w = allWards.find(x => x.id === wardId)
               if (!h || !w) return <span className="text-slate-400 font-normal">Pilih Faskes & Ruangan</span>
               return (
                 <div className="flex items-center gap-2 truncate">
                   <span className="font-bold text-primary">{h.nama}</span>
                   <span className="text-ink-muted">›</span>
                   <span className="size-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: w.kode_warna }} />
                   <span className="font-bold text-primary-deep">{w.nama}</span>
                 </div>
               )
            })() : (
              <span className="text-slate-400 font-normal">Pilih Faskes & Ruangan</span>
            )}
            <ChevronDown size={16} className="text-ink-muted shrink-0 ml-2" />
          </button>
          
          {showFaskesMenu && (
            <>
              {/* Backdrop klik luar untuk menutup dropdown */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowFaskesMenu(false)}
              />
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl bg-white border border-slate-300 shadow-2xl p-2 space-y-3 animate-in fade-in zoom-in-95">
                {hospitals?.map(h => {
                   const hWards = allWards?.filter(w => w.hospital_id === h.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) || [];
                   if (hWards.length === 0) return null;
                   return (
                     <div key={h.id} className="space-y-1">
                       <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 rounded-xl">
                         <span className="text-xs font-bold text-slate-700">{h.nama}</span>
                       </div>
                       {hWards.map(w => (
                         <button 
                           key={w.id} 
                           type="button"
                           className="flex items-center gap-2 w-full px-2 py-2 hover:bg-slate-100 rounded-xl text-left pl-4 cursor-pointer transition-colors"
                           onClick={() => {
                             setHospitalId(h.id!);
                             setWardId(w.id!);
                             setShowFaskesMenu(false);
                           }}
                         >
                           <span className="size-2.5 rounded-full shadow-xs shrink-0" style={{ backgroundColor: w.kode_warna }} />
                           <span className="text-xs font-semibold text-slate-800">{w.nama}</span>
                         </button>
                       ))}
                     </div>
                   )
                })}
                {!hospitals?.length && <p className="text-xs text-center text-slate-400 p-2">Belum ada faskes. Tambah di Pengaturan.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* S (SUBJEKTIF) */}
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3 animate-in fade-in slide-in-from-bottom-2 border border-slate-300/80 relative z-0">
        <div className="pb-2 border-b border-slate-200">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            S (Subjektif)
          </h2>
        </div>
        <ResizableTextarea
          textareaRef={sRef}
          value={form.S}
          onChange={(e) => set({ S: e.target.value })}
          placeholder="Keluhan utama, RPS, RPD, RPO, RPK/Sosial, Alergi..."
          rows={5}
          className={textareaCls}
          highlightClass={hl('S')}
        />
      </div>

      {/* O (OBJEKTIF) */}
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-5 animate-in fade-in slide-in-from-bottom-2 border border-slate-300/80 relative z-0">
        <div className="pb-2 border-b border-slate-200">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            O (Objektif)
          </h2>
        </div>

        {/* Sub 1: Pemeriksaan Fisik */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              Pemeriksaan Fisik
            </label>
            <button
              type="button"
              onClick={() => pemfisAttachRef.current?.click()}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              + Lampiran Foto/Video
            </button>
          </div>
          <ResizableTextarea
            value={form.O_pemfis}
            onChange={(e) => set({ O_pemfis: e.target.value })}
            placeholder="TTV, status generalis, status neurologis..."
            rows={6}
            className={textareaCls}
            highlightClass={hl('O_pemfis')}
          />
          {attachments.filter((a) => a.kategori === 'pemfis').length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.filter((a) => a.kategori === 'pemfis').map((a) => (
                <div key={a.id} className="size-14 rounded-2xl bg-slate-100 border border-slate-300 overflow-hidden relative group">
                  {a.type.startsWith('image/') ? (
                    <img src={a.dataUrl} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center bg-white text-slate-600">
                      <FileText size={16} />
                      <span className="caption truncate w-full text-center px-1 font-bold">{a.name.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  )}
                  <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="absolute top-1 right-1 bg-ink/80 text-white rounded-full p-0.5">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sub 2: Penunjang */}
        <div className="space-y-2 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              Penunjang
            </label>
            <button
              type="button"
              onClick={() => penunjangAttachRef.current?.click()}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              + Lampiran CT/Lab/EKG
            </button>
          </div>
          <ResizableTextarea
            value={form.O_penunjang}
            onChange={(e) => set({ O_penunjang: e.target.value })}
            placeholder="Hasil laboratorium, rontgen, CT Scan, MRI, EKG..."
            rows={4}
            className={textareaCls}
            highlightClass={hl('O_penunjang')}
          />
          {attachments.filter((a) => a.kategori === 'penunjang').length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.filter((a) => a.kategori === 'penunjang').map((a) => (
                <div key={a.id} className="size-14 rounded-2xl bg-slate-100 border border-slate-300 overflow-hidden relative group">
                  {a.type.startsWith('image/') ? (
                    <img src={a.dataUrl} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center bg-white text-slate-600">
                      <FileText size={16} />
                      <span className="caption truncate w-full text-center px-1 font-bold">{a.name.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  )}
                  <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="absolute top-1 right-1 bg-ink/80 text-white rounded-full p-0.5">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KARTU 3: A (ASSESSMENT) */}
      <div className={'glass-card rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 border border-slate-300/80 relative z-0 ' + hl('A')}>
        <div className="pb-2 border-b border-slate-200">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">A (Assessment)</h2>
        </div>

        {/* Subjudul 1: Diagnosis Utama (1 item) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-extrabold text-primary uppercase tracking-wider">
            Diagnosis Utama
          </label>
          <input
            value={form.A[0]?.nama_diagnosis || ''}
            onChange={(e) => {
              const newA = [...form.A]
              if (newA.length === 0) {
                newA.push({ kategori: 'Utama', nama_diagnosis: e.target.value, icd10: '' })
              } else {
                newA[0] = { ...newA[0], kategori: 'Utama', nama_diagnosis: e.target.value }
              }
              set({ A: newA })
            }}
            placeholder="Diagnosis utama pasien..."
            className="w-full rounded-xl bg-slate-100/90 border border-slate-300 px-3.5 py-2.5 outline-none font-bold text-slate-900 text-xs placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 shadow-2xs transition-all"
          />
        </div>

        {/* Subjudul 2: Diagnosis Sekunder */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wider">
            Diagnosis Sekunder
          </label>

          {form.A.slice(1).map((dx, idx) => {
            const actualIndex = idx + 1
            return (
              <div key={actualIndex} className="flex gap-2 items-center">
                <input
                  value={dx.nama_diagnosis}
                  onChange={(e) => {
                    const newA = [...form.A]
                    newA[actualIndex] = { ...newA[actualIndex], nama_diagnosis: e.target.value }
                    set({ A: newA })
                  }}
                  placeholder={`Diagnosis sekunder ${actualIndex}...`}
                  className="flex-1 min-w-0 rounded-xl bg-slate-100/90 border border-slate-300 px-3.5 py-2.5 outline-none font-semibold text-slate-900 text-xs placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 shadow-2xs transition-all"
                />
                <button
                  type="button"
                  aria-label="Hapus diagnosis sekunder"
                  className="p-1.5 cursor-pointer text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl shrink-0 transition-colors"
                  onClick={() => {
                    const newA = form.A.filter((_, j) => j !== actualIndex)
                    set({ A: newA })
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => {
              const newA = form.A.length === 0
                ? [{ kategori: 'Utama' as const, nama_diagnosis: '', icd10: '' }, { kategori: 'Sekunder' as const, nama_diagnosis: '', icd10: '' }]
                : [...form.A, { kategori: 'Sekunder' as const, nama_diagnosis: '', icd10: '' }]
              set({ A: newA })
            }}
            className="text-xs font-bold text-primary hover:underline px-1 pt-1 cursor-pointer inline-flex items-center"
          >
            + Tambah Diagnosis Sekunder
          </button>
        </div>
      </div>

      {/* KARTU 4: PLANNING DIAGNOSTIK */}
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3 animate-in fade-in slide-in-from-bottom-2 border border-slate-300/80 relative z-0">
        <div className="pb-2 border-b border-slate-200">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Planning Diagnostik</h2>
        </div>

        <div className="space-y-2">
          {form.P.filter(it => it.kategori === 'Diagnostik').map((it) => {
            const originalIndex = form.P.indexOf(it)
            return (
              <div key={originalIndex} className="flex items-center gap-2">
                <input
                  value={it.nama_item}
                  onChange={(e) => {
                    const newP = [...form.P]
                    newP[originalIndex] = { ...newP[originalIndex], nama_item: e.target.value }
                    set({ P: newP })
                  }}
                  placeholder="Nama Prosedur / Lab"
                  className="flex-1 min-w-0 rounded-xl bg-slate-100/90 border border-slate-300 px-3.5 py-2.5 outline-none font-bold text-slate-900 text-xs placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 shadow-2xs transition-all"
                />

                <input
                  value={it.dosis_keterangan}
                  onChange={(e) => {
                    const newP = [...form.P]
                    newP[originalIndex] = { ...newP[originalIndex], dosis_keterangan: e.target.value }
                    set({ P: newP })
                  }}
                  placeholder="Keterangan"
                  className="w-28 sm:w-36 rounded-xl bg-slate-100/90 border border-slate-300 px-3 py-2.5 outline-none text-xs text-slate-800 font-semibold placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary shadow-2xs transition-all"
                />

                <button
                  type="button"
                  aria-label="Hapus planning diagnostik"
                  className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer p-1.5 shrink-0 transition-colors"
                  onClick={() => set({ P: form.P.filter((_, j) => j !== originalIndex) })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>

        <input
          placeholder="+ Tambahkan PDx (mis. CT Scan Kepala Non Kontras, EKG, DL)"
          className={inputCls}
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim()
            if (e.key === 'Enter' && v) {
              set({ P: [...form.P, { ...lineToTerapi(v, today()), kategori: 'Diagnostik' }] })
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
      </div>

      {/* KARTU 5: PLANNING TERAPI */}
      <div className={'glass-card rounded-3xl p-5 shadow-sm space-y-3 animate-in fade-in slide-in-from-bottom-2 border border-slate-300/80 relative z-0 ' + hl('P')}>
        <div className="pb-2 border-b border-slate-200">
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Planning Terapi</h2>
        </div>

        <div className="space-y-2">
          {form.P
            .filter(it => it.kategori !== 'Diagnostik')
            .map((it) => {
              const originalIndex = form.P.indexOf(it)
              return (
                <div key={originalIndex} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newP = [...form.P]
                      newP[originalIndex].kategori = it.kategori === 'Farmakologi' ? 'Non-Farmakologi' : 'Farmakologi'
                      set({ P: newP })
                    }}
                    className={`rounded-xl px-2.5 py-2.5 caption font-bold transition-colors cursor-pointer shrink-0 shadow-2xs ${
                      it.kategori === 'Farmakologi'
                        ? 'bg-primary text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                    title="Klik untuk ubah Farmako / Non-Farmako"
                  >
                    {it.kategori === 'Farmakologi' ? 'Farmako' : 'Non-Farmako'}
                  </button>

                  <input
                    value={it.nama_item}
                    onChange={(e) => {
                      const newP = [...form.P]
                      newP[originalIndex] = { ...newP[originalIndex], nama_item: e.target.value }
                      set({ P: newP })
                    }}
                    placeholder="Nama Obat / Terapi"
                    className="flex-1 min-w-0 rounded-xl bg-slate-100/90 border border-slate-300 px-3.5 py-2.5 outline-none font-bold text-slate-900 text-xs placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 shadow-2xs transition-all"
                  />

                  <input
                    value={it.dosis_keterangan}
                    onChange={(e) => {
                      const newP = [...form.P]
                      newP[originalIndex] = { ...newP[originalIndex], dosis_keterangan: e.target.value }
                      set({ P: newP })
                    }}
                    placeholder="Dosis & Rute (mis. 1x80mg PO)"
                    className="w-32 sm:w-36 rounded-xl bg-slate-100/90 border border-slate-300 px-3 py-2.5 outline-none text-xs text-slate-800 font-semibold placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary shadow-2xs transition-all"
                  />

                  <button
                    type="button"
                    aria-label="Hapus planning terapi"
                    className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer p-1.5 shrink-0 transition-colors"
                    onClick={() => set({ P: form.P.filter((_, j) => j !== originalIndex) })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}
        </div>

        {saranP.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {saranP.map((s) => (
              <button
                key={s.nama_item}
                type="button"
                onClick={() => tambahSaran(s)}
                className="cursor-pointer rounded-full bg-primary-soft/20 px-2.5 py-1 caption font-bold text-primary hover:bg-primary-soft/30 transition-all"
                title={`Sering ditambahkan pada kasus serupa (${s.dosis_keterangan || 'lihat riwayat'})`}
              >
                + {s.nama_item}
              </button>
            ))}
          </div>
        )}

        <input
          placeholder="+ Tambahkan Terapi (mis. Citicoline 2x500mg IV, Head up 30°)"
          className={inputCls}
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim()
            if (e.key === 'Enter' && v) {
              const isNonFarmako = /head\s*up|posisi|tirah\s*baring|diet|o2|oksigen|fisioterapi|mobilisasi|edukasi/i.test(v)
              set({
                P: [
                  ...form.P,
                  {
                    ...lineToTerapi(v, today()),
                    kategori: isNonFarmako ? 'Non-Farmakologi' : 'Farmakologi',
                  },
                ],
              })
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
      </div>

      {komentarAnalisis && !stagedAnalysis && (
        <div className="rounded-2xl bg-blue-50/80 p-3.5 border border-blue-100">
          <div className="mb-1 text-blue-700 font-bold text-xs">
            Analisis AI
          </div>
          <p className="text-xs text-blue-900 leading-relaxed">{komentarAnalisis}</p>
        </div>
      )}

      {/* Tombol Aksi Form */}
      <div className="flex gap-2 w-full pt-2">
        <button
          onClick={handleAnalisisClick}
          disabled={busy === 'analisis'}
          className={`flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-blue-100 px-4 py-3 text-xs font-bold text-blue-700 transition-all hover:bg-blue-200 active:scale-95 disabled:active:scale-100 ${busy === 'analisis' || (!form.S.trim() && !form.O_pemfis.trim()) ? 'opacity-50' : ''}`}
        >
          {busy === 'analisis' && <Loader2 size={16} className="animate-spin" />}
          <span>Analisis</span>
        </button>
        <button
          onClick={simpan}
          disabled={busy === 'analisis'}
          className={`flex-[2] flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-5 py-3 text-xs font-bold text-white shadow-md shadow-primary/30 transition-all hover:brightness-110 active:scale-95 disabled:active:scale-100 ${busy === 'analisis' || !form.nama_depan.trim() ? 'opacity-50' : ''}`}
        >
          <span>Simpan Pasien</span>
        </button>
      </div>

      {/* Review Usulan Analisis AI (Staging) */}
      {stagedAnalysis && (
        <div className="glass-card rounded-3xl p-5 shadow-md space-y-4 border-2 border-blue-300 bg-blue-50/30 animate-in fade-in slide-in-from-bottom-2">
          <div className="pb-2 border-b border-blue-200">
            <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
              Usulan Analisis AI (Periksa & Edit Sebelum ACC)
            </h3>
            <p className="caption text-blue-700 mt-0.5">
              Koreksi atau sesuaikan usulan diagnosis dan terapi di bawah ini sebelum diterapkan ke formulir.
            </p>
          </div>

          {/* Komentar Analisis */}
          {stagedAnalysis.komentar && (
            <div className="rounded-2xl bg-blue-100/70 p-3.5 border border-blue-200 text-xs text-blue-950 leading-relaxed font-medium">
              {stagedAnalysis.komentar}
            </div>
          )}

          {/* Staged Diagnoses */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Usulan Diagnosis
            </label>
            {stagedAnalysis.A.map((dx, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="text-xs font-bold text-slate-500 w-5 text-right shrink-0">{idx + 1}.</span>
                <input
                  value={dx.nama_diagnosis}
                  onChange={(e) => {
                    const newA = [...stagedAnalysis.A]
                    newA[idx] = { ...newA[idx], nama_diagnosis: e.target.value }
                    setStagedAnalysis({ ...stagedAnalysis, A: newA })
                  }}
                  placeholder="Nama diagnosis..."
                  className="flex-1 min-w-0 rounded-xl bg-white border border-slate-300 px-3.5 py-2 outline-none font-bold text-slate-900 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
                />
                <button
                  type="button"
                  aria-label="Hapus diagnosis"
                  className="p-1.5 cursor-pointer text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl shrink-0 transition-colors"
                  onClick={() => {
                    const newA = stagedAnalysis.A.filter((_, j) => j !== idx)
                    setStagedAnalysis({ ...stagedAnalysis, A: newA })
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setStagedAnalysis({
                  ...stagedAnalysis,
                  A: [...stagedAnalysis.A, { kategori: 'Sekunder', nama_diagnosis: '', icd10: '' }]
                })
              }}
              className="text-xs font-bold text-blue-600 hover:underline px-1 pt-1 cursor-pointer inline-flex items-center"
            >
              + Tambah Usulan Diagnosis
            </button>
          </div>

          {/* Staged Terapi */}
          <div className="space-y-2 pt-2 border-t border-blue-200">
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Usulan Terapi & Prosedur
            </label>
            {stagedAnalysis.P.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newP = [...stagedAnalysis.P]
                    newP[idx].kategori = item.kategori === 'Farmakologi' ? 'Non-Farmakologi' : 'Farmakologi'
                    setStagedAnalysis({ ...stagedAnalysis, P: newP })
                  }}
                  className={`rounded-xl px-2.5 py-2 caption font-bold transition-colors cursor-pointer shrink-0 shadow-2xs ${
                    item.kategori === 'Farmakologi'
                      ? 'bg-primary text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                  title="Klik untuk ganti jenis"
                >
                  {item.kategori === 'Farmakologi' ? 'Farmako' : 'Non-Farmako'}
                </button>

                <input
                  value={item.nama_item}
                  onChange={(e) => {
                    const newP = [...stagedAnalysis.P]
                    newP[idx] = { ...newP[idx], nama_item: e.target.value }
                    setStagedAnalysis({ ...stagedAnalysis, P: newP })
                  }}
                  placeholder="Nama item..."
                  className="flex-1 min-w-0 rounded-xl bg-white border border-slate-300 px-3.5 py-2 outline-none font-bold text-slate-900 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
                />

                <input
                  value={item.dosis_keterangan}
                  onChange={(e) => {
                    const newP = [...stagedAnalysis.P]
                    newP[idx] = { ...newP[idx], dosis_keterangan: e.target.value }
                    setStagedAnalysis({ ...stagedAnalysis, P: newP })
                  }}
                  placeholder="Dosis / Keterangan"
                  className="w-32 sm:w-36 rounded-xl bg-white border border-slate-300 px-3 py-2 outline-none text-xs text-slate-800 font-semibold focus:border-blue-500 shadow-2xs transition-all"
                />

                <button
                  type="button"
                  aria-label="Hapus terapi"
                  className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer p-1.5 shrink-0 transition-colors"
                  onClick={() => {
                    const newP = stagedAnalysis.P.filter((_, j) => j !== idx)
                    setStagedAnalysis({ ...stagedAnalysis, P: newP })
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setStagedAnalysis({
                  ...stagedAnalysis,
                  P: [
                    ...stagedAnalysis.P,
                    {
                      nama_item: '',
                      kategori: 'Farmakologi',
                      dosis_keterangan: '',
                      tgl_mulai: today(),
                      tgl_stop: null,
                      status: 'aktif'
                    }
                  ]
                })
              }}
              className="text-xs font-bold text-blue-600 hover:underline px-1 pt-1 cursor-pointer inline-flex items-center"
            >
              + Tambah Usulan Terapi
            </button>
          </div>

          {/* Action Buttons Staging: Batal & ACC */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStagedAnalysis(null)}
              className="flex-1 py-3 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-colors shadow-2xs"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                set({
                  A: stagedAnalysis.A.filter(a => a.nama_diagnosis.trim()),
                  P: stagedAnalysis.P.filter(p => p.nama_item.trim()),
                })
                setKomentarAnalisis(stagedAnalysis.komentar)
                setStagedAnalysis(null)
                notify('Usulan AI telah diterapkan ke formulir!')
                window.scrollTo({ top: 350, behavior: 'smooth' })
              }}
              className="flex-[2] py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-blue-500/20 transition-all active:scale-95"
            >
              ACC & Terapkan ke Form
            </button>
          </div>
        </div>
      )}

      {/* hidden inputs */}
      <input ref={pemfisAttachRef} type="file" accept="image/*,video/*" hidden onChange={(e) => e.target.files?.[0] && handleAttachFile(e.target.files[0], 'pemfis')} />
      <input ref={penunjangAttachRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => e.target.files?.[0] && handleAttachFile(e.target.files[0], 'penunjang')} />

      <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && runOcr(e.target.files[0])} />
      <input ref={ocrGalleryRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && runOcr(e.target.files[0])} />

      {/* Floating AI Input Bar — Tetap Putih Bersih, Menyambung dengan Highlight Tab Nav Bar */}
      {(() => {
        const inputBarJsx = (
          <div className="w-full flex flex-col items-center pointer-events-auto">
            {/* Helper status text — Mengambang elegan di atas kotak input */}
            {(busy === 'ocr' || listening || busy === 'ai' || busy === 'analisis') && (
              <div className="mb-2 flex items-center justify-center gap-2 caption font-medium text-ink bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg border border-primary/25 w-max mx-auto animate-in fade-in duration-150">
                {busy === 'ocr' && <><Loader2 size={13} className="animate-spin text-primary" /> <span className="text-primary font-bold">Mengekstrak teks...</span></>}
                {busy === 'ai' && <><Loader2 size={13} className="animate-spin text-primary" /> <span className="text-primary font-bold">AI sedang merapikan...</span></>}
                {busy === 'analisis' && <><Loader2 size={13} className="animate-spin text-blue-600" /> <span className="text-blue-600 font-bold">AI sedang menganalisis...</span></>}
                {listening && <><Mic size={13} className="animate-pulse text-rose-500" /> <span className="text-rose-500 font-bold">Mendengarkan...</span></>}
              </div>
            )}

            {/* Kotak Input Putih Bersih — dengan Fade Shadow Lembut ke Atas agar Terpisah Tegas dari Objek Belakang */}
            <div className="flex flex-col rounded-t-3xl rounded-b-none bg-white border-t border-x border-slate-300/80 border-b-0 p-2.5 transition-shadow w-full relative z-20 shadow-[0_-12px_36px_-6px_rgba(15,23,42,0.18),0_-4px_14px_-2px_rgba(15,23,42,0.08)]">
              {/* Preview Lampiran Gambar yang Ditempel / Diunggah */}
              {attachments.length > 0 && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 overflow-x-auto w-full hide-scrollbar">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                    <FileText size={11} className="text-primary" /> {attachments.length} Lampiran:
                  </span>
                  {attachments.map((a) => (
                    <div key={a.id} className="relative size-11 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 group shadow-xs">
                      {a.type.startsWith('image/') ? (
                        <img src={a.dataUrl} className="size-full object-cover" alt={a.name} />
                      ) : (
                        <div className="flex size-full items-center justify-center text-[9px] font-bold text-slate-500 uppercase">
                          {a.name.split('.').pop() || 'FILE'}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                        className="absolute top-0.5 right-0.5 size-4 bg-slate-900/80 text-white rounded-full flex items-center justify-center hover:bg-rose-500 transition-colors cursor-pointer"
                        title="Hapus lampiran"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 w-full">
                {/* Radial Fan Attachment Menu (Kamera, Galeri, Dikte ala Lomeal) */}
                <AttachmentMenu
                  disabled={busy === 'ai'}
                  isListening={listening}
                  onSelectCamera={() => ocrCameraRef.current?.click()}
                  onSelectGallery={() => ocrGalleryRef.current?.click()}
                  onSelectMic={toggleMic}
                />

                {/* Textarea Auto-Expand tanpa resize handle */}
                <textarea
                  ref={textRef}
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value)
                    adjustTextHeight()
                  }}
                  onPaste={handlePaste}
                  onFocus={() => setIsTextFocused(true)}
                  onBlur={() => setIsTextFocused(false)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      if ((raw.trim() || attachments.length > 0) && busy !== 'ai') {
                        parseAi()
                      }
                    }
                  }}
                  placeholder="Ketik/tempel laporan medis atau paste foto EKG/Lab/Radiologi..."
                  rows={isTextFocused || raw ? 3 : 1}
                  maxLength={10000}
                  style={{
                    height: (isTextFocused || raw) ? '70px' : '42px',
                    minHeight: (isTextFocused || raw) ? '70px' : '42px',
                    maxHeight: '145px'
                  }}
                  className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-2xl p-2.5 px-3 text-xs outline-none text-slate-900 font-medium placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors leading-relaxed overflow-y-auto hide-scrollbar"
                />

              {/* Murni Tombol Send di sebelah kanan */}
              <div className="shrink-0 flex items-center mb-0.5">
                <button
                  type="button"
                  onClick={parseAi}
                  disabled={busy === 'ai' || (!raw.trim() && attachments.length === 0)}
                  aria-label="Kirim ke AI"
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-all ${
                    raw.trim() || attachments.length > 0
                      ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30 active:scale-95 cursor-pointer'
                      : 'bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed'
                  } ${busy === 'ai' ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {busy === 'ai' ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                  ) : (
                    <Send size={18} className={raw.trim() || attachments.length > 0 ? 'translate-x-0.5' : ''} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )

        return dockSlot ? (
          createPortal(inputBarJsx, dockSlot)
        ) : (
          <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 px-4 pointer-events-none flex flex-col items-center">
            <div className="w-full max-w-sm pointer-events-auto">
              {inputBarJsx}
            </div>
          </div>
        )
      })()}

      {/* Modal Pilih Pasien Lama / Readmisi */}
      {showSearchModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setShowSearchModal(false)}
        >
          <div
            className="flex h-[80dvh] max-h-[600px] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-300 overscroll-contain touch-auto select-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <p className="text-xs font-bold text-ink">Pilih Pasien Lama (Readmisi)</p>
                <p className="caption text-ink-muted">Pilih pasien untuk menyambungkan riwayat rawat inap & rekam medis</p>
              </div>
              <button onClick={() => setShowSearchModal(false)} aria-label="Tutup" className="cursor-pointer rounded-full p-1.5 text-ink-muted hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  autoFocus
                  value={patientSearchQ}
                  onChange={(e) => setPatientSearchQ(e.target.value)}
                  placeholder="Cari nama, RM, atau diagnosis…"
                  className={inputCls + ' pl-9 text-xs'}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
              {filteredPatients.map((p) => {
                const h = hospitals?.find(x => x.id === p.hospital_id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectExistingPatient(p)}
                    className="w-full text-left rounded-2xl bg-slate-50 hover:bg-primary/10 border border-slate-200 hover:border-primary/40 p-3 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-ink flex items-center gap-1.5 flex-wrap">
                          <span>{p.title}</span>
                          <Masked value={p.nama_depan || (p as any).inisial} type="name" />
                          {p.usia && <span className="caption font-normal text-ink-muted">({p.usia})</span>}
                          <span className="caption font-normal text-ink-muted">· RM <Masked value={p.no_rm} type="rm" /></span>
                        </p>
                        <p className="text-xs text-primary-deep font-medium mt-0.5 truncate">
                          {p.diagnosis_utama || '—'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 caption font-semibold">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary-deep">{p.jaminan}</span>
                          {h && <span className="rounded-full bg-surface px-2 py-0.5 text-ink-muted">{h.nama}</span>}
                          <span className={`rounded-full px-2 py-0.5 ${p.status_rawat === 'aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-surface text-ink-muted'}`}>
                            {p.status_rawat === 'aktif'
                              ? 'Sedang Dirawat'
                              : p.keterangan_krs === 'Meninggal'
                              ? 'MD'
                              : p.keterangan_krs === 'APS'
                              ? 'APS'
                              : p.keterangan_krs === 'Alih Rawat'
                              ? `Alih Rawat${p.detail_krs ? `: ${p.detail_krs}` : ''}`
                              : p.keterangan_krs === 'Rujuk'
                              ? `Rujuk${p.detail_krs ? `: ${p.detail_krs}` : ''}`
                              : 'KRS'}
                          </span>
                          <span className="rounded-full bg-surface px-2 py-0.5 text-ink-muted">
                            MRS: {formatDate(p.tgl_mrs)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 pt-1">
                        <span className="caption font-bold text-primary group-hover:underline">Pilih</span>
                      </div>
                    </div>
                  </button>
                )
              })}
              {!filteredPatients.length && (
                <div className="py-8 text-center text-xs text-ink-muted">
                  <p>Tidak ditemukan pasien yang cocok.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 py-2.5 text-center shadow-lg shadow-primary/30">
          {toast.split('\n').map((line, i) => (
            <p key={i} className={i === 0 ? 'text-xs font-bold text-white' : 'mt-0.5 caption font-medium text-white/85'}>
              {line}
            </p>
          ))}
        </div>
      )}
    </main>
    </>
  )
}
