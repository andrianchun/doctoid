import { useState, useEffect, useMemo, useRef } from 'react'
import {
  X,
  FileText,
  List,
  Plus,
  Trash2,
  Check,
} from 'lucide-react'
import { type TerapiItem, type KategoriTerapi } from '../db'
import { lineToTerapi } from '../parser'
import { getLocalDateString } from '../utils/dateFormat'
import { useBodyScrollLock } from '../utils/useBodyScrollLock'

const KATEGORI_OPTIONS: KategoriTerapi[] = [
  'Farmakologi',
  'Diagnostik',
  'Non-Farmakologi',
  'Monitoring',
  'Edukasi',
]

interface BatchTerapiModalProps {
  isOpen: boolean
  onClose: () => void
  items: TerapiItem[]
  noteDate: string
  onSave: (newItems: TerapiItem[]) => Promise<void> | void
}

/**
 * Format daftar item terapi menjadi teks terstruktur rapi per kategori
 */
export function formatTerapiToBatchText(items: TerapiItem[]): string {
  const categories: Array<{ key: TerapiItem['kategori']; header: string }> = [
    { key: 'Diagnostik', header: '# Plan Diagnostik & Prosedur (PDX)' },
    { key: 'Farmakologi', header: '# Terapi Farmakologi (PTX)' },
    { key: 'Non-Farmakologi', header: '# Terapi Non-Farmakologi' },
    { key: 'Monitoring', header: '# Monitoring (PMX)' },
    { key: 'Edukasi', header: '# Edukasi Pasien & Keluarga (PEX)' },
  ]

  const blocks: string[] = []

  for (const cat of categories) {
    const catItems = items.filter((it) => it.kategori === cat.key)
    if (catItems.length > 0) {
      const lines = [cat.header]
      catItems.forEach((it) => {
        const stopTag = it.status === 'stop' ? ' [stop]' : ''
        if (cat.key === 'Diagnostik') {
          const detail = it.dosis_keterangan ? ` : ${it.dosis_keterangan}` : ''
          lines.push(`${it.nama_item}${detail}${stopTag}`)
        } else {
          const doseStr = it.dosis_keterangan ? ` ${it.dosis_keterangan}` : ''
          lines.push(`${it.nama_item}${doseStr}${stopTag}`)
        }
      })
      blocks.push(lines.join('\n'))
    }
  }

  if (blocks.length === 0) {
    return `# Plan Diagnostik & Prosedur (PDX)\n\n# Terapi Farmakologi (PTX)\n`
  }

  return blocks.join('\n\n')
}

/**
 * Parsing teks multiline kembali menjadi array TerapiItem yang bersih
 */
export function parseBatchTerapiText(text: string, today: string): TerapiItem[] {
  const lines = text.split('\n')
  const results: TerapiItem[] = []
  let currentCat: KategoriTerapi = 'Farmakologi'

  for (const raw of lines) {
    const line = raw.replace(/^[*_~#]+|[*_~#]+$/g, '').trim()
    if (!line) continue

    // Deteksi sub-header
    if (/^(?:pdx|plan\s*diagnostik|diagnostik|prosedur|usulan\s*lab)\b/i.test(line)) {
      currentCat = 'Diagnostik'
      continue
    }
    if (/^(?:ptx|plan\s*terapi|farmakologi|medikamentosa|terapi\s*obat)\b/i.test(line)) {
      currentCat = 'Farmakologi'
      continue
    }
    if (/^(?:non-?farmakologi|non\s*farmako)\b/i.test(line)) {
      currentCat = 'Non-Farmakologi'
      continue
    }
    if (/^(?:pmx|plan\s*monitoring|monitoring|observasi)\b/i.test(line)) {
      currentCat = 'Monitoring'
      continue
    }
    if (/^(?:pex|plan\s*edukasi|edukasi)\b/i.test(line)) {
      currentCat = 'Edukasi'
      continue
    }

    // Buang penomoran baris / bullet
    let clean = line.replace(/^[-•*•–—\d.)\]]+\s*/, '').trim()
    if (!clean) continue

    // Deteksi tag [stop] atau [selesai]
    let isStopped = false
    if (/\[(?:stop|selesai|done|berhenti)\]|\((?:stop|selesai|done|berhenti)\)/i.test(clean)) {
      isStopped = true
      clean = clean.replace(/\[(?:stop|selesai|done|berhenti)\]|\((?:stop|selesai|done|berhenti)\)/gi, '').trim()
    }

    if (currentCat === 'Diagnostik') {
      const colonIdx = clean.indexOf(':')
      let nama = clean
      let dosis = ''
      if (colonIdx > -1) {
        nama = clean.slice(0, colonIdx).trim()
        dosis = clean.slice(colonIdx + 1).trim()
      }
      if (nama) {
        results.push({
          nama_item: nama,
          dosis_keterangan: dosis,
          status: isStopped ? 'stop' : 'aktif',
          kategori: 'Diagnostik',
          tgl_mulai: today,
          tgl_stop: isStopped ? today : null,
        })
      }
    } else if (currentCat === 'Monitoring' || currentCat === 'Edukasi' || currentCat === 'Non-Farmakologi') {
      const colonIdx = clean.indexOf(':')
      let nama = clean
      let dosis = ''
      if (colonIdx > -1) {
        nama = clean.slice(0, colonIdx).trim()
        dosis = clean.slice(colonIdx + 1).trim()
      }
      if (nama) {
        results.push({
          nama_item: nama,
          dosis_keterangan: dosis,
          status: isStopped ? 'stop' : 'aktif',
          kategori: currentCat,
          tgl_mulai: today,
          tgl_stop: isStopped ? today : null,
        })
      }
    } else {
      // Farmakologi
      const parsed = lineToTerapi(clean, today, 'Farmakologi')
      if (parsed.nama_item) {
        if (isStopped) {
          parsed.status = 'stop'
          parsed.tgl_stop = today
        }
        results.push(parsed)
      }
    }
  }

  return results
}

export default function BatchTerapiModal({
  isOpen,
  onClose,
  items,
  noteDate,
  onSave,
}: BatchTerapiModalProps) {
  useBodyScrollLock(isOpen)

  const [activeTab, setActiveTab] = useState<'text' | 'rows'>('text')
  const [rawText, setRawText] = useState('')
  const [rowItems, setRowItems] = useState<TerapiItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const todayStr = noteDate || getLocalDateString()

  // Inisialisasi data saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      const validItems = items.filter((it) => it.nama_item?.trim())
      setRowItems(validItems.map((it) => ({ ...it })))
      setRawText(formatTerapiToBatchText(validItems))
      setActiveTab('text')
    }
  }, [isOpen, items])

  // Sinkronisasi saat berganti tab
  const handleSwitchTab = (newTab: 'text' | 'rows') => {
    if (newTab === activeTab) return
    if (newTab === 'rows') {
      // Parse dari text ke rows
      const parsed = parseBatchTerapiText(rawText, todayStr)
      setRowItems(parsed)
    } else {
      // Format dari rows ke text
      const formatted = formatTerapiToBatchText(rowItems.filter((it) => it.nama_item?.trim()))
      setRawText(formatted)
    }
    setActiveTab(newTab)
  }

  // Preview hitungan item saat di tab text
  const textParsedCount = useMemo(() => {
    if (activeTab !== 'text') return rowItems.length
    const parsed = parseBatchTerapiText(rawText, todayStr)
    return parsed.length
  }, [activeTab, rawText, todayStr, rowItems.length])

  // Sisipkan header kategori ke textarea
  const insertCategoryHeader = (headerText: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const current = rawText
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = current.substring(0, start)
    const after = current.substring(end)
    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n\n')
    const insertText = `${needsNewlineBefore ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${headerText}\n`
    const updated = before + insertText + after
    setRawText(updated)

    setTimeout(() => {
      ta.focus()
      const newPos = before.length + insertText.length
      ta.setSelectionRange(newPos, newPos)
    }, 0)
  }

  // Row editor handlers
  const handleUpdateRow = (index: number, patch: Partial<TerapiItem>) => {
    setRowItems((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...patch }
      return copy
    })
  }

  const handleRemoveRow = (index: number) => {
    setRowItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddRow = (cat: KategoriTerapi = 'Farmakologi') => {
    setRowItems((prev) => [
      ...prev,
      {
        nama_item: '',
        dosis_keterangan: '',
        status: 'aktif',
        kategori: cat,
        tgl_mulai: todayStr,
        tgl_stop: null,
      },
    ])
  }

  // Simpan perubahan batch
  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      let finalItems: TerapiItem[] = []
      if (activeTab === 'text') {
        finalItems = parseBatchTerapiText(rawText, todayStr)
      } else {
        finalItems = rowItems.filter((it) => it.nama_item?.trim())
      }
      await onSave(finalItems)
      onClose()
    } catch (err) {
      console.error('Gagal menyimpan batch terapi:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-3xl bg-white shadow-2xl overscroll-contain touch-auto select-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-5 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-ink">Batch Edit Planning & Terapi</h3>
            <p className="text-[11px] text-ink-muted">
              Ubah daftar obat (PTX), pemeriksaan (PDX), & rencana monitoring sekaligus
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher: Mode Teks vs Mode Baris */}
        <div className="flex items-center gap-1.5 px-4 sm:px-5 pt-3 pb-2 border-b border-slate-100/80 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchTab('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'text'
                ? 'bg-primary text-white shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-slate-200/50'
            }`}
          >
            <FileText size={13} /> Editor Teks Bebas
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('rows')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'rows'
                ? 'bg-primary text-white shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-slate-200/50'
            }`}
          >
            <List size={13} /> Editor Baris Cepat ({rowItems.length})
          </button>
        </div>

        {/* Isi Modal Tab */}
        <div className="flex-1 overflow-y-auto p-4 sm:px-5 space-y-3 min-h-0">
          {activeTab === 'text' ? (
            <div className="space-y-2.5">
              {/* Tombol Cepat Sisipkan Kategori */}
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="text-ink-muted font-semibold mr-1">Sisipkan:</span>
                <button
                  type="button"
                  onClick={() => insertCategoryHeader('# Plan Diagnostik & Prosedur (PDX)')}
                  className="px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200/70 font-semibold hover:bg-sky-100 cursor-pointer transition-colors"
                >
                  + PDX (Diagnostik)
                </button>
                <button
                  type="button"
                  onClick={() => insertCategoryHeader('# Terapi Farmakologi (PTX)')}
                  className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/70 font-semibold hover:bg-blue-100 cursor-pointer transition-colors"
                >
                  + PTX (Obat)
                </button>
                <button
                  type="button"
                  onClick={() => insertCategoryHeader('# Terapi Non-Farmakologi')}
                  className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70 font-semibold hover:bg-emerald-100 cursor-pointer transition-colors"
                >
                  + Non-Farmako
                </button>
                <button
                  type="button"
                  onClick={() => insertCategoryHeader('# Monitoring (PMX)')}
                  className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/70 font-semibold hover:bg-amber-100 cursor-pointer transition-colors"
                >
                  + PMX
                </button>
                <button
                  type="button"
                  onClick={() => insertCategoryHeader('# Edukasi (PEX)')}
                  className="px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/70 font-semibold hover:bg-violet-100 cursor-pointer transition-colors"
                >
                  + PEX
                </button>
              </div>

              {/* Textarea Multi-line */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  rows={12}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Ketik atau tempel daftar terapi..."
                  className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/40 p-3 font-mono text-xs text-ink leading-relaxed outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-y min-h-[220px]"
                />
              </div>

              {/* Status Bar Parser */}
              <div className="flex items-center justify-between text-[11px] text-ink-muted px-1">
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <Check size={13} /> {textParsedCount} item terdeteksi
                </span>
                <span className="text-slate-400">
                  Tambahkan <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">[stop]</code> untuk terapi selesai
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {rowItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-ink-muted">
                  Belum ada item terapi. Klik tombol tambah di bawah untuk membuat item baru.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 space-y-1">
                  {rowItems.map((row, idx) => {
                    const isStop = row.status === 'stop'
                    return (
                      <div
                        key={idx}
                        className={`pt-2 pb-1.5 px-2 rounded-xl space-y-1.5 transition-colors ${
                          isStop ? 'bg-slate-50/60 opacity-80' : 'hover:bg-slate-50/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {/* Selector Kategori */}
                          <select
                            value={row.kategori}
                            onChange={(e) =>
                              handleUpdateRow(idx, {
                                kategori: e.target.value as KategoriTerapi,
                              })
                            }
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-ink outline-none focus:border-primary cursor-pointer shrink-0"
                          >
                            {KATEGORI_OPTIONS.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>

                          {/* Nama Item */}
                          <div className="min-w-0 flex-1">
                            <input
                              value={row.nama_item}
                              onChange={(e) => handleUpdateRow(idx, { nama_item: e.target.value })}
                              placeholder="Nama obat / tindakan..."
                              className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-ink outline-none focus:border-primary bg-white"
                            />
                          </div>

                          {/* Tombol Stop / Aktif */}
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateRow(idx, {
                                status: isStop ? 'aktif' : 'stop',
                                tgl_stop: isStop ? null : todayStr,
                              })
                            }
                            className={`px-2 h-8 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer transition-colors ${
                              isStop
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'text-slate-500 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                            }`}
                          >
                            {isStop ? 'Re-aktif' : 'Stop'}
                          </button>

                          {/* Tombol Hapus Baris */}
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            aria-label="Hapus baris"
                            className="size-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Dosis / Keterangan Baris */}
                        <div className="pl-1">
                          <input
                            value={row.dosis_keterangan}
                            onChange={(e) =>
                              handleUpdateRow(idx, { dosis_keterangan: e.target.value })
                            }
                            placeholder={
                              row.kategori === 'Diagnostik'
                                ? 'Keterangan klinis (mis. cari data saat mrs)...'
                                : 'Dosis & rute (mis. 1x750mg iv, 1000cc/24jam)...'
                            }
                            className="w-full h-7 rounded-lg border border-slate-100 px-2.5 text-[11px] text-ink-muted outline-none focus:border-primary focus:bg-white bg-slate-50/50"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Tambah Baris Cepat */}
              <div className="pt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddRow('Farmakologi')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold cursor-pointer transition-colors"
                >
                  <Plus size={13} /> Tambah Obat (PTX)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRow('Diagnostik')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-bold cursor-pointer transition-colors"
                >
                  <Plus size={13} /> Tambah PDX
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRow('Monitoring')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold cursor-pointer transition-colors"
                >
                  <Plus size={13} /> Tambah Monitoring
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Aksi Modal */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 sm:px-5 bg-slate-50/30 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Check size={14} /> Simpan Perubahan Batch
          </button>
        </div>
      </div>
    </div>
  )
}
