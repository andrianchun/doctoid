import React, { useState } from 'react'
import {
  FileText,
  Play,
  Pause,
  Eye,
  EyeOff,
  X,
  Volume2,
  Video as VideoIcon,
  Maximize2,
} from 'lucide-react'
import { ImageViewerModal } from './ImageViewerModal'

export interface ClinicalMediaItem {
  id?: string
  name: string
  type: string
  dataUrl: string
  kategori?: 'pemfis' | 'penunjang'
  tag?: 'EKG' | 'Radiologi' | 'Lab' | 'Pemfis' | 'Lainnya'
}

interface ClinicalMediaCardProps {
  item: ClinicalMediaItem
  onDelete?: () => void
  defaultBlurred?: boolean
}

export const ClinicalMediaCard: React.FC<ClinicalMediaCardProps> = ({
  item,
  onDelete,
  defaultBlurred = true,
}) => {
  // Video kejang dan foto klinis dilindungi blur secara default demi privasi pasien
  const isVisualMedia = item.type.startsWith('image/') || item.type.startsWith('video/')
  const [isBlurred, setIsBlurred] = useState(isVisualMedia ? defaultBlurred : false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  const toggleAudio = () => {
    if (!audioRef) return
    if (isPlayingAudio) {
      audioRef.pause()
      setIsPlayingAudio(false)
    } else {
      audioRef.play().then(() => setIsPlayingAudio(true)).catch(() => {})
    }
  }

  // Tipe Berkas: Video (mis. Video Kejang)
  if (item.type.startsWith('video/')) {
    return (
      <>
        <div className="relative group size-20 sm:size-24 rounded-2xl bg-slate-900 border border-slate-300 overflow-hidden shrink-0 flex flex-col items-center justify-center shadow-xs">
          <video
            src={item.dataUrl}
            className={`size-full object-cover transition-all duration-200 ${
              isBlurred ? 'blur-md scale-110' : ''
            }`}
          />

          {/* Privacy Overlay jika sedang diblur */}
          {isBlurred ? (
            <button
              type="button"
              onClick={() => setIsBlurred(false)}
              className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 p-1 text-center cursor-pointer hover:bg-slate-900/40 transition-colors"
            >
              <EyeOff size={16} className="text-white mb-0.5" />
              <span className="text-[9px] font-bold text-white leading-tight">Video Kejang</span>
              <span className="text-[8px] text-white/80">Ketuk Buka</span>
            </button>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
              <button
                type="button"
                onClick={() => setShowVideoModal(true)}
                className="size-8 rounded-full bg-white/90 text-primary flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Putar Video"
              >
                <Play size={14} className="ml-0.5 fill-primary" />
              </button>
            </div>
          )}

          {/* Tombol Toggle Blur Mata */}
          {!isBlurred && (
            <button
              type="button"
              onClick={() => setIsBlurred(true)}
              className="absolute bottom-1 left-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors cursor-pointer"
              title="Kunci / Blur Kembali"
            >
              <Eye size={11} />
            </button>
          )}

          {/* Tombol Hapus */}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 hover:bg-rose-700 transition-colors cursor-pointer shadow-xs"
              title="Hapus"
            >
              <X size={10} />
            </button>
          )}

          <div className="absolute bottom-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[8px] font-bold text-white flex items-center gap-0.5">
            <VideoIcon size={9} />
            <span>Video</span>
          </div>
        </div>

        {/* Modal Pemutar Video Full / Loop untuk Analisis Kejang */}
        {showVideoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="relative max-w-lg w-full bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 p-2 space-y-2">
              <div className="flex items-center justify-between px-2 pt-1">
                <span className="text-xs font-bold text-white truncate max-w-[80%]">
                  🎥 {item.name || 'Video Klinis Pasien'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowVideoModal(false)}
                  className="text-white/80 hover:text-white p-1 rounded-full cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[70vh]">
                <video
                  src={item.dataUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="max-h-[65vh] w-full object-contain"
                />
              </div>

              <div className="text-[11px] text-slate-400 px-2 pb-1 text-center">
                💡 Video diatur <i>looping otomatis</i> agar dokter dapat mengamati fase tonik, klonik, deviasi konjugat mata, dan automatisme berulang kali.
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Tipe Berkas: Audio (Voice Note WhatsApp)
  if (item.type.startsWith('audio/')) {
    return (
      <div className="relative group h-14 sm:h-16 px-3 rounded-2xl bg-amber-50 border border-amber-200 shrink-0 flex items-center gap-2.5 shadow-xs">
        <audio
          ref={(node) => setAudioRef(node)}
          src={item.dataUrl}
          onEnded={() => setIsPlayingAudio(false)}
          className="hidden"
        />

        <button
          type="button"
          onClick={toggleAudio}
          className="size-9 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs hover:bg-amber-600 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          {isPlayingAudio ? <Pause size={15} /> : <Play size={15} className="ml-0.5 fill-white" />}
        </button>

        <div className="flex flex-col min-w-[90px] max-w-[140px]">
          <span className="text-xs font-bold text-amber-950 truncate">{item.name || 'Voice Note WA'}</span>
          <span className="text-[10px] text-amber-700 flex items-center gap-1 font-semibold">
            <Volume2 size={11} />
            <span>Rekaman Suara</span>
          </span>
        </div>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-amber-800 hover:text-rose-600 p-1 rounded-full cursor-pointer transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>
    )
  }

  // Tipe Berkas: Dokumen PDF (Hasil Lab / Rujukan)
  if (item.type === 'application/pdf') {
    return (
      <div className="relative group size-20 sm:size-24 rounded-2xl bg-rose-50 border border-rose-200 shrink-0 flex flex-col items-center justify-center p-1.5 shadow-xs">
        <FileText size={22} className="text-rose-600 mb-1" />
        <span className="text-[10px] font-bold text-rose-950 text-center truncate w-full px-1">
          {item.name || 'Dokumen Lab.pdf'}
        </span>
        <a
          href={item.dataUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-bold hover:bg-rose-700 transition-colors"
        >
          Buka PDF
        </a>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="absolute top-1 right-1 bg-ink/70 text-white rounded-full p-0.5 hover:bg-rose-600 transition-colors cursor-pointer"
          >
            <X size={10} />
          </button>
        )}
      </div>
    )
  }

  // Tipe Berkas: Foto / Gambar (Foto Lab, Rontgen, atau Foto Fisik Pasien)
  return (
    <>
      <div className="relative group size-20 sm:size-24 rounded-2xl bg-slate-100 border border-slate-300 overflow-hidden shrink-0 flex flex-col items-center justify-center shadow-xs">
        <img
          src={item.dataUrl}
          alt={item.name}
          onClick={() => {
            if (!isBlurred) setShowViewer(true)
          }}
          className={`size-full object-cover transition-all duration-200 ${
            isBlurred ? 'blur-md scale-110' : 'cursor-pointer hover:scale-105'
          }`}
        />

        {item.tag && !isBlurred && (
          <div className="absolute top-1 left-1 pointer-events-none z-10">
            <span
              className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-tight shadow-xs backdrop-blur-md ${
                item.tag === 'EKG'
                  ? 'bg-amber-500/90 text-white'
                  : item.tag === 'Radiologi'
                  ? 'bg-purple-600/90 text-white'
                  : item.tag === 'Lab'
                  ? 'bg-teal-600/90 text-white'
                  : 'bg-slate-700/90 text-white'
              }`}
            >
              {item.tag}
            </span>
          </div>
        )}

        {isBlurred ? (
          <button
            type="button"
            onClick={() => setIsBlurred(false)}
            className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 p-1 text-center cursor-pointer hover:bg-slate-900/40 transition-colors"
          >
            <EyeOff size={16} className="text-white mb-0.5" />
            <span className="text-[9px] font-bold text-white">Privasi</span>
            <span className="text-[8px] text-white/80">Ketuk Buka</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowViewer(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Buka & Zoom Galeri"
            >
              <Maximize2 size={16} className="text-white drop-shadow-md" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsBlurred(true)
              }}
              className="absolute bottom-1 left-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all cursor-pointer z-10"
              title="Kunci / Blur Kembali"
            >
              <Eye size={11} />
            </button>
          </>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="absolute top-1 right-1 bg-ink/80 text-white rounded-full p-0.5 hover:bg-rose-600 transition-colors cursor-pointer shadow-xs z-10"
            title="Hapus"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {showViewer && (
        <ImageViewerModal
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          images={[{ url: item.dataUrl, name: item.name, type: item.type }]}
        />
      )}
    </>
  )
}
