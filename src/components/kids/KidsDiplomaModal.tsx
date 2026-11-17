import React, { useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  Edit3,
  Printer,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import {
  getKidsLevelInfo,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  type KidsProgressState,
} from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir } from './kidsI18n';
import { KidsAnimatedMascotSvg } from './KidsSvgArt';
import { FlagBadgeSvg } from '../ui/LanguageBadge';

interface KidsDiplomaModalProps {
  open: boolean;
  onClose: () => void;
  kidsLang: KidsLanguageCode;
}

export const KidsDiplomaModal: React.FC<KidsDiplomaModalProps> = ({
  open,
  onClose,
  kidsLang,
}) => {
  const profile = useKidsStore((s) => s.getActiveProfile());
  const ux = useKidsStore((s) => s.ux);
  const updateActiveProfile = useKidsStore((s) => s.updateActiveProfile);

  const [customName, setCustomName] = useState(profile.name || 'Peque Explorador');
  const [isEditingName, setIsEditingName] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string>('');

  const diplomaRef = useRef<HTMLDivElement | null>(null);

  if (!open) return null;

  const dir = getKidsDir(kidsLang);
  const levelInfo = getKidsLevelInfo(profile.stars);
  const activeMascot =
    KIDS_MASCOTS.find((m) => m.id === profile.mascotId) || KIDS_MASCOTS[0];
  const completedNodesCount = Object.keys(profile.completedNodes || {}).length;
  const unlockedStickersCount = (profile.unlockedStickers || []).length;
  const todayFormatted = new Date().toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customName.trim() || 'Peque Explorador';
    setCustomName(clean);
    updateActiveProfile((prev: KidsProgressState) => ({ ...prev, name: clean }));
    setIsEditingName(false);
    playKidsSound('tap', ux.soundEnabled, true);
  };

  const handleDownloadDiploma = async () => {
    triggerHaptic('success');
    playKidsSound('star', ux.soundEnabled, true);
    setDownloading(true);
    setNotice('');

    try {
      // Lazy load modern-screenshot to capture clean 2x vector resolution
      const { domToPng } = await import('modern-screenshot');
      if (!diplomaRef.current) throw new Error('Element not ready');

      const dataUrl = await domToPng(diplomaRef.current, {
        scale: 2,
        backgroundColor: '#090D22',
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `diploma-riffan-kids-${customName.toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setNotice('¡Diploma descargado en alta resolución!');
      setTimeout(() => setNotice(''), 3500);
    } catch {
      // Graceful fallback: trigger print dialogue
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    triggerHaptic('medium');
    playKidsSound('tap', ux.soundEnabled, true);
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-tv-modal="true"
      dir={dir}
      className="fixed inset-0 z-[280] bg-[#040612]/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 landscape:p-1.5 overflow-y-auto no-scrollbar"
    >
      <div className="w-full max-w-3xl my-auto rounded-3xl bg-[#0F1738] border-2 border-amber-400/40 shadow-2xl flex flex-col overflow-hidden">
        {/* MODAL CONTROLS BAR */}
        <div className="shrink-0 px-4 py-3 bg-[#0B1028] border-b border-white/10 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-5 h-5 text-amber-300 shrink-0" />
            <h2 className="font-display font-black text-sm sm:text-base text-white truncate">
              Diploma Oficial de Honor · Academia Riffan Kids
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-tv-focusable="true"
              onClick={handlePrint}
              aria-label="Imprimir diploma"
              className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <Printer className="w-4 h-4 text-sky-300" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <button
              type="button"
              data-tv-focusable="true"
              disabled={downloading}
              onClick={() => void handleDownloadDiploma()}
              className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-amber-300 shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Generando...' : 'Descargar Imagen'}</span>
            </button>

            <button
              type="button"
              data-tv-focusable="true"
              onClick={onClose}
              aria-label="Cerrar diploma"
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {notice && (
          <div className="shrink-0 bg-emerald-500/20 border-b border-emerald-400/40 text-emerald-200 text-xs font-black text-center py-2 px-3">
            {notice}
          </div>
        )}

        {/* PRINTABLE DIPLOMA CANVAS STAGE */}
        <div className="p-3 sm:p-6 overflow-y-auto max-h-[75dvh] no-scrollbar">
          <div
            ref={diplomaRef}
            className="relative rounded-3xl p-5 sm:p-8 bg-gradient-to-b from-[#141C42] via-[#0D1433] to-[#090D22] border-4 border-amber-400/60 shadow-[0_0_50px_rgba(245,158,11,0.18)] flex flex-col items-center text-center select-none"
          >
            {/* Ornamental Frame Border */}
            <div className="absolute inset-2.5 rounded-2xl border border-amber-300/25 pointer-events-none" />

            {/* Corner Emblems */}
            <div className="absolute top-4 start-4 text-amber-400/40">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div className="absolute top-4 end-4 text-amber-400/40">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div className="absolute bottom-4 start-4 text-amber-400/40">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div className="absolute bottom-4 end-4 text-amber-400/40">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>

            {/* Top Header & Crest */}
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-center gap-2">
                <span className="h-0.5 w-8 sm:w-16 bg-gradient-to-r from-transparent to-amber-400/60" />
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-amber-300">
                  Academia Riffan Kids · Certificación Oficial
                </span>
                <span className="h-0.5 w-8 sm:w-16 bg-gradient-to-l from-transparent to-amber-400/60" />
              </div>
              <h1 className="font-display font-black text-xl sm:text-3xl tracking-tight bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 bg-clip-text text-transparent">
                DIPLOMA DE HONOR
              </h1>
              <p className="text-[11px] sm:text-xs text-sky-200/80 font-bold">
                Por constancia, curiosidad y maestría lingüística y matemática
              </p>
            </div>

            {/* Mascot & Student Recognition */}
            <div className="flex items-center justify-center gap-3 my-2">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400/15 border-2 border-amber-300/45 p-1 flex items-center justify-center shadow-lg">
                <KidsAnimatedMascotSvg id={profile.mascotId} size={50} />
              </div>

              <div className="text-start">
                <div className="text-[10px] uppercase font-bold text-sky-300">Se otorga con orgullo a:</div>
                {isEditingName ? (
                  <form onSubmit={handleSaveName} className="flex items-center gap-1.5 mt-0.5">
                    <input
                      type="text"
                      autoFocus
                      maxLength={28}
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="h-8 px-2.5 rounded-lg bg-[#182352] border border-amber-300 text-sm font-black text-amber-300 outline-none"
                    />
                    <button
                      type="submit"
                      className="h-8 px-2.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                    >
                      Guardar
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-lg sm:text-2xl text-white">
                      {customName}
                    </span>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => setIsEditingName(true)}
                      aria-label="Editar nombre del alumno"
                      className="p-1 rounded-lg hover:bg-white/10 text-amber-300/80 hover:text-amber-300 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Achievement Highlights Box */}
            <div className="w-full max-w-xl my-3 p-3.5 rounded-2xl bg-[#0B1028]/85 border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-1.5 rounded-xl bg-white/[0.04]">
                <div className="text-[10px] font-bold text-sky-200">Rango Alcanzado</div>
                <div className="text-xs sm:text-sm font-black text-amber-300 truncate">
                  Nivel {levelInfo.level}
                </div>
              </div>
              <div className="p-1.5 rounded-xl bg-white/[0.04]">
                <div className="text-[10px] font-bold text-sky-200">Estrellas de Oro</div>
                <div className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
                  {profile.stars}
                </div>
              </div>
              <div className="p-1.5 rounded-xl bg-white/[0.04]">
                <div className="text-[10px] font-bold text-sky-200">Islas y Nodos</div>
                <div className="text-xs sm:text-sm font-black text-emerald-300 tabular-nums">
                  {completedNodesCount} / 24
                </div>
              </div>
              <div className="p-1.5 rounded-xl bg-white/[0.04]">
                <div className="text-[10px] font-bold text-sky-200">Cromos Colección</div>
                <div className="text-xs sm:text-sm font-black text-pink-300 tabular-nums">
                  {unlockedStickersCount} / 16
                </div>
              </div>
            </div>

            {/* Languages Ribbon */}
            <div className="my-2 space-y-1.5">
              <div className="text-[10px] font-extrabold uppercase text-amber-300/90 tracking-wider">
                8 Idiomas con Tarifit (Rifeño)
              </div>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                {KIDS_LANGUAGES.map((l) => (
                  <span
                    key={l.code}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-white"
                  >
                    <FlagBadgeSvg code={l.flagCode} className="w-3.5 h-2.5" />
                    <span>{l.nativeLabel}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Signature & Seal Footer */}
            <div className="w-full max-w-xl mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-start gap-4">
              <div>
                <div className="text-[10px] font-bold text-sky-200/75">Fecha de Expedición</div>
                <div className="text-xs font-black text-white">{todayFormatted}</div>
                <div className="text-[10px] text-zinc-400">Riffan Kids · Sin publicidad</div>
              </div>

              {/* Vector Golden Seal */}
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-amber-300 p-0.5 shadow-lg shrink-0 flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-[#0E1535] flex flex-col items-center justify-center text-center p-1 border border-amber-300/40">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 mb-0.5" />
                  <span className="text-[7px] font-black uppercase text-amber-200 leading-tight">
                    Sello de Oro
                  </span>
                  <span className="text-[6px] font-bold text-sky-200 leading-tight">
                    Aprobado
                  </span>
                </div>
              </div>

              <div className="text-end">
                <div className="text-[10px] font-bold text-sky-200/75">Mascota Guía</div>
                <div className="text-xs font-black text-amber-300">{activeMascot.name}</div>
                <div className="text-[10px] text-emerald-300 flex items-center justify-end gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verificado</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
