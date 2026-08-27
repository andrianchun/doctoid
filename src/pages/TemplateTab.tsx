import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, ClipboardCopy, Check, Edit3 } from 'lucide-react'
import { db, type Patient, type ProgressNote, type DiagnosisItem } from '../db'
import { formatDate, hariKe } from '../utils/dateFormat'

const inputCls =
  'w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all shadow-2xs'

export function sortDiagnoses(diagnoses: DiagnosisItem[] | string | undefined): DiagnosisItem[] {
  if (!diagnoses || typeof diagnoses === 'string') return []
  // Autosort: Utama always index 0, followed by Sekunder
  return [...diagnoses].sort((a, b) => (a.kategori === 'Utama' ? -1 : b.kategori === 'Utama' ? 1 : 0))
}

export function renderTemplate(fmt: string, p: Patient, latest?: ProgressNote): string {
  const sortedA = sortDiagnoses(latest?.A)
  const aText = sortedA.length > 0
    ? sortedA.map((a, i) => `${i === 0 ? '[Utama] ' : '[Sekunder] '}${a.nama_diagnosis}${a.icd10 ? ` (${a.icd10})` : ''}`).join('\n')
    : (p.diagnosis_utama || '')

  const pdxItems = (latest?.P ?? [])
    .filter((t) => t.kategori === 'Diagnostik')
    .map((t) => `- ${t.nama_item}${t.icd9 ? ` [ICD-9: ${t.icd9}]` : ''} ${t.dosis_keterangan}`.trim())
    .join('\n')

  const farmakoItems = (latest?.P ?? [])
    .filter((t) => t.status === 'aktif' && t.kategori === 'Farmakologi')
    .map((t) => `- ${t.nama_item} ${t.dosis_keterangan}`.trim())
    .join('\n')

  const nonFarmakoItems = (latest?.P ?? [])
    .filter((t) => t.status === 'aktif' && t.kategori === 'Non-Farmakologi')
    .map((t) => `- ${t.nama_item} ${t.dosis_keterangan}`.trim())
    .join('\n')

  const monitoringItems = (latest?.P ?? [])
    .filter((t) => t.status === 'aktif' && t.kategori === 'Monitoring')
    .map((t) => `- ${t.nama_item} ${t.dosis_keterangan}`.trim())
    .join('\n')

  const edukasiItems = (latest?.P ?? [])
    .filter((t) => t.status === 'aktif' && t.kategori === 'Edukasi')
    .map((t) => `- ${t.nama_item} ${t.dosis_keterangan}`.trim())
    .join('\n')

  const allActiveP = (latest?.P ?? [])
    .filter((t) => t.status === 'aktif')
    .map((t) => `- [${t.kategori || 'PTx'}] ${t.nama_item}${t.icd9 ? ` (${t.icd9})` : ''} ${t.dosis_keterangan}`.trim())
    .join('\n')

  const vars: Record<string, string> = {
    title: p.title || '',
    nama_depan: p.nama_depan || (p as any).inisial || '',
    usia: p.usia ? `${p.usia} th` : '',
    no_rm: p.no_rm || '',
    diagnosis_utama: p.diagnosis_utama || (sortedA.find(d => d.kategori === 'Utama')?.nama_diagnosis ?? ''),
    jaminan: p.jaminan || 'BPJS',
    tgl_mrs: formatDate(p.tgl_mrs),
    tgl_onset: p.tgl_onset ? formatDate(p.tgl_onset) : '',
    OH: p.tgl_onset ? `OH-${hariKe(p.tgl_onset)}` : '',
    P: `P-${hariKe(p.tgl_mrs)}`,
    hari_rawat: String(hariKe(p.tgl_mrs)),
    hari_stroke: p.tgl_onset ? String(hariKe(p.tgl_onset)) : '',
    onset_hari: p.tgl_onset ? String(hariKe(p.tgl_onset)) : '',
    perawatan_hari: String(hariKe(p.tgl_mrs)),
    S: latest?.S ?? '',
    O_pemfis: latest?.O_pemfis ?? '',
    O_penunjang: latest?.O_penunjang ?? '',
    A: aText,
    PDX: pdxItems,
    PTX: farmakoItems,
    PTX_NONFARMAKO: nonFarmakoItems,
    PMX: monitoringItems,
    PEX: edukasiItems,
    terapi_aktif: allActiveP,
    icd9_code: (latest?.P ?? []).filter((t) => t.kategori === 'Diagnostik' && t.icd9).map((t) => t.icd9).join(', '),
  }

  return fmt.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export default function TemplateTab() {
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3500)
  }

  const templates = useLiveQuery(() => db.templates.toArray(), [], [])
  const patients = useLiveQuery(() => db.patients.toArray(), [], [])

  const [tplId, setTplId] = useState<number>(0)
  const [tplPasienId, setTplPasienId] = useState<number>(0)
  const [output, setOutput] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newNama, setNewNama] = useState('')
  const [newFmt, setNewFmt] = useState('')

  // Seed default clinical templates if empty
  useMemo(async () => {
    const count = await db.templates.count()
    if (count === 0) {
      await db.templates.bulkAdd([
        {
          nama_template: 'Operan Jaga Malam Neurologi',
          format_string: 'OPERAN JAGA NEUROLOGI\nPasien: {{nama_depan}} ({{usia}}) / RM: {{no_rm}} / [{{jaminan}}]\nDiagnosis Utama: {{diagnosis_utama}} (Rawat H-{{hari_rawat}})\n\n[S]:\n{{S}}\n\n[O]:\n- Pemfis: {{O_pemfis}}\n- Penunjang: {{O_penunjang}}\n\n[A]:\n{{A}}\n\n[PLANNING]:\n* Diagnostik (PDx):\n{{PDX}}\n\n* Terapi (PTx):\n{{PTX}}\n{{PTX_NONFARMAKO}}\n\n* Monitoring (PMx):\n{{PMX}}\n\n* Edukasi (PEx):\n{{PEX}}',
        },
        {
          nama_template: 'Lembar Konsul Antar Spesialis',
          format_string: 'LEMBAR KONSULTASI KLINIS\nKepada Yth. Dokter Konsulen\nMohon evaluasi dan tatalaksana bersama pada pasien:\nNama: {{nama_depan}} ({{usia}})\nNo. RM: {{no_rm}}\nMRS: {{tgl_mrs}} (H-{{hari_rawat}})\nDiagnosis: {{diagnosis_utama}}\n\nIkhtisar Klinis:\nS: {{S}}\nO: {{O_pemfis}}\nPenunjang: {{O_penunjang}}\nTerapi Berjalan:\n{{terapi_aktif}}\n\nTerima kasih atas kerjasamanya.',
        },
        {
          nama_template: 'Resume Singkat Pulang (KRS)',
          format_string: 'RESUME RAWAT INAP (KRS)\nNama: {{nama_depan}} | No. RM: {{no_rm}}\nMRS: {{tgl_mrs}} | Hari Rawat: {{hari_rawat}} hari\nDiagnosis Utama: {{diagnosis_utama}}\n\nObat Pulang:\n{{PTX}}\n\nInstruksi Kontrol & Edukasi:\n{{PEX}}',
        },
      ])
    }
  }, [])

  const generate = async () => {
    const tpl = templates?.find((t) => t.id === tplId)
    const p = patients?.find((x) => x.id === tplPasienId)
    if (!tpl || !p) return
    const notes = await db.progressNotes.where('patient_id').equals(p.id!).sortBy('tanggal')
    const latestNote = notes[notes.length - 1]
    setOutput(renderTemplate(tpl.format_string, p, latestNote))
  }

  const handleCopy = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      notify('Teks template berhasil disalin ke clipboard ✓')
    } catch {
      notify('Clipboard tidak tersedia — silakan salin manual')
    }
  }

  return (
    <main className="space-y-5 p-5">
      {/* Banner — 1 Baris */}
      <div className="glass-blue-hero rounded-3xl px-5 py-4 text-white shadow-xl">
        <h1 className="h1 text-2xl font-black text-white">Template Generator</h1>
      </div>

      {/* Main Generator Card */}
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <p className="h3 text-xs font-bold text-ink">
            Pilih Template & Pasien
          </p>
          <button
            onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            <Plus size={14} /> Buat Template
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caption font-bold block mb-1">Pilih Format Template</label>
            <select
              value={tplId}
              onChange={(e) => setTplId(+e.target.value)}
              className={inputCls + ' h-11'}
            >
              <option value={0}>— Pilih Template —</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama_template}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="caption font-bold block mb-1">Pilih Data Pasien</label>
            <select
              value={tplPasienId}
              onChange={(e) => setTplPasienId(+e.target.value)}
              className={inputCls + ' h-11'}
            >
              <option value={0}>— Pilih Pasien —</option>
              {patients?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.nama_depan || (p as any).inisial} (RM: {p.no_rm})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={generate}
            disabled={!tplId || !tplPasienId}
            className="flex-1 h-11 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all"
          >
            Render Teks Operan
          </button>
          {tplId > 0 && (
            <button
              onClick={async () => {
                if (window.confirm('Hapus template ini?')) {
                  await db.templates.delete(tplId)
                  setTplId(0)
                  notify('Template berhasil dihapus')
                }
              }}
              title="Hapus template"
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-surface text-ink-muted hover:text-rose-600 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {/* Modal Buat Template Baru */}
        {showNew && (
          <div className="mt-3 space-y-3 rounded-2xl bg-surface/80 p-4 border border-primary-soft/20 animate-in fade-in">
            <p className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Edit3 size={14} className="text-primary" /> Buat Format Template Kustom
            </p>
            <input
              value={newNama}
              onChange={(e) => setNewNama(e.target.value)}
              placeholder="Nama template (mis. Lap. Kasus Stroke)"
              className={inputCls}
            />
            <textarea
              value={newFmt}
              onChange={(e) => setNewFmt(e.target.value)}
              rows={6}
              placeholder={'Format: {{nama_depan}} / RM: {{no_rm}}\nDx: {{diagnosis_utama}}\nS: {{S}}\nO: {{O_pemfis}}\nA:\n{{A}}\nP:\n{{PTX}}'}
              className={inputCls + ' resize-y font-mono text-xs'}
            />
            <p className="caption font-medium text-ink-muted leading-relaxed">
              <b>Variabel Otomatis:</b> {'{{nama_depan}} {{usia}} {{no_rm}} {{jaminan}} {{diagnosis_utama}} {{hari_rawat}} {{hari_stroke}} {{S}} {{O_pemfis}} {{O_penunjang}} {{A}} {{PDX}} {{PTX}} {{PTX_NONFARMAKO}} {{PMX}} {{PEX}} {{terapi_aktif}}'}
            </p>
            <div className="flex gap-2">
              <button
                disabled={!newNama.trim() || !newFmt.trim()}
                onClick={async () => {
                  await db.templates.add({ nama_template: newNama.trim(), format_string: newFmt.trim() })
                  setNewNama('')
                  setNewFmt('')
                  setShowNew(false)
                  notify('Template baru berhasil disimpan ✓')
                }}
                className="flex-1 h-10 cursor-pointer items-center justify-center rounded-xl bg-primary text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-40"
              >
                Simpan Format
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="h-10 px-4 cursor-pointer items-center justify-center rounded-xl bg-card text-xs font-semibold text-ink-muted"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Output Area */}
        {output && (
          <div className="mt-4 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="caption text-xs font-bold text-ink-muted">Hasil Teks Render:</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                <ClipboardCopy size={13} /> Salin ke Clipboard
              </button>
            </div>
            <textarea
              value={output}
              readOnly
              rows={9}
              className={inputCls + ' resize-y bg-surface/90 font-mono text-xs'}
            />
            <button
              onClick={handleCopy}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/20 active:scale-95 transition-all"
            >
              <Check size={16} /> Salin Teks
            </button>
          </div>
        )}
      </div>

      {toast && (
        <aside
          aria-label="Notifikasi"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2"
        >
          {toast}
        </aside>
      )}
    </main>
  )
}
