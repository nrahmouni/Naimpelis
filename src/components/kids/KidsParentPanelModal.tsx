import React from 'react';
import {
  BarChart3,
  Cast,
  Check,
  Download,
  KeyRound,
  Link2,
  Settings2,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { CatalogMovie, KidsAgeGroup } from '../../types';
import type { KidsUxSettings } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_EXIT_PIN,
  KIDS_LANGUAGES,
  type KidsProgressState,
} from './kidsData';
import type { KidsUiCopy } from './kidsI18n';
import { KidsApkInstallCard } from './KidsApkInstallCard';

interface KidsParentPanelModalProps {
  open: boolean;
  onClose: () => void;
  dir: 'ltr' | 'rtl';
  t: KidsUiCopy;
  progress: KidsProgressState;
  ux: KidsUxSettings;
  ageGroups: Array<{ id: KidsAgeGroup; label: string }>;
  recommendedSessionMinutes: number;
  parentPin: string;
  curPinInput: string;
  setCurPinInput: (val: string) => void;
  newPinInput: string;
  setNewPinInput: (val: string) => void;
  pinChangeNotice: { ok: boolean; msg: string } | null;
  setPinChangeNotice: (val: { ok: boolean; msg: string } | null) => void;
  resetDefaultPin: () => void;
  handleSaveCustomPin: (e: React.FormEvent) => void;
  updateParentPrefs: (patch: Partial<KidsProgressState['parentPrefs']>) => void;
  toggleSound: () => void;
  toggleLowStimulation: () => void;
  toggleDyslexiaFont: () => void;
  toggleSyllableHighlight: () => void;
  toggleTortoiseSpeech: () => void;
  parentCandidatePool: CatalogMovie[];
  toggleApprovedTitle: (movie: CatalogMovie) => void;
  ytImportUrl: string;
  setYtImportUrl: (val: string) => void;
  ytImportLoading: boolean;
  setYtImportLoading: (loading: boolean) => void;
  ytImportStatus: string;
  setYtImportStatus: (status: string) => void;
  onOpenSmartTv?: () => void;
  onOpenFamilyOnboarding: () => void;
  onExitKids: () => void;
}

export const KidsParentPanelModal: React.FC<KidsParentPanelModalProps> = ({
  open,
  onClose,
  dir,
  t,
  progress,
  ux,
  ageGroups,
  recommendedSessionMinutes,
  parentPin,
  curPinInput,
  setCurPinInput,
  newPinInput,
  setNewPinInput,
  pinChangeNotice,
  setPinChangeNotice,
  resetDefaultPin,
  handleSaveCustomPin,
  updateParentPrefs,
  toggleSound,
  toggleLowStimulation,
  toggleDyslexiaFont,
  toggleSyllableHighlight,
  toggleTortoiseSpeech,
  parentCandidatePool,
  toggleApprovedTitle,
  ytImportUrl,
  setYtImportUrl,
  ytImportLoading,
  setYtImportLoading,
  ytImportStatus,
  setYtImportStatus,
  onOpenSmartTv,
  onOpenFamilyOnboarding,
  onExitKids,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir={dir}
      className="fixed inset-0 z-[265] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-lg max-h-[90dvh] rounded-3xl bg-[#141B38] border-2 border-sky-400/40 p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-sky-400" />
            <h2 className="font-display font-extrabold text-lg text-white">
              {t.parentPanelTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pe-1">
          {/* Custom On-Device Parent PIN Manager */}
          <form
            onSubmit={handleSaveCustomPin}
            className="p-3 rounded-2xl bg-[#0D1226] border border-amber-400/30 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-200">
                <KeyRound className="w-4 h-4" />
                <span>{t.pinChangeTitle}</span>
              </div>
              {parentPin !== KIDS_EXIT_PIN && (
                <button
                  type="button"
                  onClick={() => {
                    resetDefaultPin();
                    setPinChangeNotice({ ok: true, msg: t.pinResetDefaultBtn });
                  }}
                  className="text-[11px] font-bold text-sky-300 hover:underline cursor-pointer"
                >
                  {t.pinResetDefaultBtn}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={curPinInput}
                onChange={(e) => setCurPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t.pinCurrentLabel}
                className="h-10 px-3 rounded-xl bg-[#161F42] border border-white/15 text-xs font-bold text-white outline-none"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t.pinNewLabel}
                className="h-10 px-3 rounded-xl bg-[#161F42] border border-white/15 text-xs font-bold text-white outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              {pinChangeNotice ? (
                <span
                  className={`text-[11px] font-bold ${
                    pinChangeNotice.ok ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {pinChangeNotice.msg}
                </span>
              ) : (
                <span className="text-[11px] text-zinc-400">PIN: ****</span>
              )}
              <button
                type="submit"
                className="h-9 px-3.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
              >
                {t.pinSaveBtn}
              </button>
            </div>
          </form>

          {/* Lock Language */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-sky-200">{t.lockLangLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParentPrefs({ lockedLang: null })}
                className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                  !progress.parentPrefs.lockedLang
                    ? 'bg-sky-400 text-black border-sky-200'
                    : 'bg-white/5 text-zinc-200 border-white/10'
                }`}
              >
                {t.allFree}
              </button>
              {KIDS_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => updateParentPrefs({ lockedLang: l.code })}
                  className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                    progress.parentPrefs.lockedLang === l.code
                      ? 'bg-amber-400 text-black border-amber-200'
                      : 'bg-white/5 text-zinc-200 border-white/10'
                  }`}
                >
                  <FlagBadgeSvg code={l.flagCode} className="w-4 h-3" />
                  <span>{l.nativeLabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Lock Age Group */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-sky-200">{t.lockAgeLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParentPrefs({ lockedAge: null })}
                className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                  !progress.parentPrefs.lockedAge
                    ? 'bg-sky-400 text-black border-sky-200'
                    : 'bg-white/5 text-zinc-200 border-white/10'
                }`}
              >
                {t.freeLabel}
              </button>
              {ageGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => updateParentPrefs({ lockedAge: g.id })}
                  className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                    progress.parentPrefs.lockedAge === g.id
                      ? 'bg-amber-400 text-black border-amber-200'
                      : 'bg-white/5 text-zinc-200 border-white/10'
                  }`}
                >
                  {g.label} {t.yearsLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Screen Timer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-sky-200">{t.screenTimerLabel}</label>
              <span className="text-[11px] font-bold text-emerald-300 tabular-nums">
                {t.activeUsageLabel}: {ux.activeMinutesToday}m · {t.recommendedShort}{' '}
                {recommendedSessionMinutes}m
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[null, 15, 30, 45].map((mins) => (
                <button
                  key={String(mins)}
                  type="button"
                  onClick={() =>
                    updateParentPrefs({
                      timerMinutes: mins,
                      timerStartedAt: mins ? Date.now() : null,
                    })
                  }
                  className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                    progress.parentPrefs.timerMinutes === mins
                      ? 'bg-emerald-400 text-black border-emerald-200'
                      : 'bg-white/5 text-zinc-200 border-white/10'
                  }`}
                >
                  {mins === null ? t.noLimit : `${mins} min`}
                </button>
              ))}
            </div>
          </div>

          {/* Audio & Sensory Ergonomics */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleSound}
              className={`h-10 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                ux.soundEnabled
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                  : 'bg-white/5 border-white/10 text-zinc-300'
              }`}
            >
              {ux.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>
                {t.effectsToggle}: {ux.soundEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleLowStimulation}
              className={`h-10 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                ux.lowStimulation
                  ? 'bg-teal-500/25 border-teal-400/60 text-teal-100'
                  : 'bg-white/5 border-white/10 text-zinc-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {t.calmMode}: {ux.lowStimulation ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Approved-only YouTube Kids List */}
          <div className="space-y-2 p-3 rounded-2xl bg-[#0D1226] border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold text-white">{t.safeModeTitle}</div>
                <div className="text-[11px] text-zinc-400">{t.safeModeDesc}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateParentPrefs({
                    approvedOnlyMode: !progress.parentPrefs?.approvedOnlyMode,
                  })
                }
                className={`h-9 px-3 rounded-xl text-xs font-black cursor-pointer border ${
                  progress.parentPrefs?.approvedOnlyMode
                    ? 'bg-emerald-400 text-black border-emerald-200'
                    : 'bg-white/10 text-zinc-200 border-white/15'
                }`}
              >
                {progress.parentPrefs?.approvedOnlyMode ? t.onLabel : t.offLabel}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {parentCandidatePool.map((item) => {
                const checked = (progress.parentPrefs?.approvedItems || []).some(
                  (m) => m.id === item.id
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleApprovedTitle(item)}
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                      checked
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                        : 'bg-white/5 border-white/10 text-zinc-300'
                    }`}
                  >
                    {checked && <Check className="w-3 h-3" />}
                    <span>{item.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Paste & Verify YouTube URL */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-sky-200">
                <Link2 className="w-3.5 h-3.5" />
                <span>Añadir enlace seguro de YouTube Kids</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={ytImportUrl}
                  onChange={(e) => setYtImportUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="flex-1 h-9 px-2.5 rounded-lg bg-[#161F42] border border-white/15 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  disabled={ytImportLoading || !ytImportUrl.trim()}
                  onClick={async () => {
                    setYtImportLoading(true);
                    setYtImportStatus('');
                    try {
                      const r = await fetch('/api/kids/youtube-resolve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: ytImportUrl, lang: progress.preferredLang }),
                      });
                      const data = await r.json();
                      if (data?.ok && data.item) {
                        const cur = progress.parentPrefs?.approvedItems || [];
                        updateParentPrefs({
                          approvedItems: [data.item, ...cur.filter((m) => m.id !== data.item.id)],
                        });
                        setYtImportUrl('');
                        setYtImportStatus(`Añadido: ${data.item.title}`);
                      } else {
                        setYtImportStatus(data?.error || 'No se pudo verificar este enlace.');
                      }
                    } catch {
                      setYtImportStatus('Error de conexión al verificar el enlace.');
                    } finally {
                      setYtImportLoading(false);
                    }
                  }}
                  className="h-9 px-3 rounded-lg bg-sky-400 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-45 shrink-0"
                >
                  {ytImportLoading ? '...' : 'Verificar'}
                </button>
              </div>
              {ytImportStatus && (
                <p className="text-[11px] font-bold text-amber-200">{ytImportStatus}</p>
              )}
            </div>
          </div>

          {/* Earn-Cinema-By-Learning & Dyslexia/Tortoise Accessibility */}
          <div className="space-y-2 p-3 rounded-2xl bg-[#0D1226] border border-indigo-400/25">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold text-white">Gana Cine Aprendiendo</div>
                <div className="text-[11px] text-zinc-400">
                  Banco actual: {progress.parentPrefs?.earnedCinemaMinutes ?? 15} min (+2 min/acierto)
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateParentPrefs({
                      earnedCinemaMinutes: (progress.parentPrefs?.earnedCinemaMinutes ?? 15) + 10,
                    })
                  }
                  className="h-8 px-2.5 rounded-lg bg-amber-400/20 text-amber-200 text-[11px] font-black cursor-pointer"
                >
                  +10m
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateParentPrefs({
                      earnCinemaByLearning: !progress.parentPrefs?.earnCinemaByLearning,
                    })
                  }
                  className={`h-8 px-3 rounded-lg text-xs font-black cursor-pointer border ${
                    progress.parentPrefs?.earnCinemaByLearning
                      ? 'bg-emerald-400 text-black border-emerald-200'
                      : 'bg-white/10 text-zinc-200 border-white/15'
                  }`}
                >
                  {progress.parentPrefs?.earnCinemaByLearning ? t.onLabel : t.offLabel}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={toggleDyslexiaFont}
                className={`h-9 px-2 rounded-lg text-[11px] font-black border cursor-pointer ${
                  ux.dyslexiaFont
                    ? 'bg-indigo-400 text-slate-950 border-indigo-200'
                    : 'bg-white/5 text-zinc-300 border-white/10'
                }`}
              >
                Lectura Dislexia: {ux.dyslexiaFont ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={toggleSyllableHighlight}
                className={`h-9 px-2 rounded-lg text-[11px] font-black border cursor-pointer ${
                  ux.syllableHighlight
                    ? 'bg-indigo-400 text-slate-950 border-indigo-200'
                    : 'bg-white/5 text-zinc-300 border-white/10'
                }`}
              >
                Sílabas: {ux.syllableHighlight ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={toggleTortoiseSpeech}
                className={`h-9 px-2 rounded-lg text-[11px] font-black border cursor-pointer ${
                  ux.tortoiseSpeech
                    ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                    : 'bg-white/5 text-zinc-300 border-white/10'
                }`}
              >
                Voz Tortuga: {ux.tortoiseSpeech ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Progreso Real & Family Export */}
          <div className="space-y-2.5 p-3 rounded-2xl bg-[#0D1226] border border-emerald-400/25">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-300">
                <BarChart3 className="w-4 h-4" />
                <span>Progreso Educativo de Hoy</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const an = progress.analytics;
                  const pct = (c: number, tot: number) => (tot > 0 ? `${Math.round((c / tot) * 100)}%` : 'Sin datos');
                  const summary = [
                    `RIFFAN KIDS - RESUMEN FAMILIAR (${new Date().toISOString().slice(0, 10)})`,
                    `Perfil: ${progress.name || 'Peque'} (${progress.ageGroup} años)`,
                    `Estrellas totales: ${progress.stars} | Racha: ${progress.streakDays} días`,
                    `Aprendizaje hoy: ${an?.learnMinutesToday ?? 0} min | Cine hoy: ${an?.cinemaMinutesToday ?? 0} min`,
                    `Precisión Idiomas: ${pct(an?.domainCorrect.lang ?? 0, an?.domainTotal.lang ?? 0)}`,
                    `Precisión Mates: ${pct(an?.domainCorrect.math ?? 0, an?.domainTotal.math ?? 0)}`,
                    `Precisión Música: ${pct(an?.domainCorrect.music ?? 0, an?.domainTotal.music ?? 0)}`,
                    `Precisión Lógica: ${pct(an?.domainCorrect.logic ?? 0, an?.domainTotal.logic ?? 0)}`,
                    `Palabras practicadas hoy: ${(an?.practicedWords || []).join(', ') || 'Ninguna aún'}`,
                  ].join('\n');
                  const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `resumen-riffan-kids-${(progress.name || 'peque').toLowerCase()}.txt`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
                className="h-8 px-2.5 rounded-lg bg-emerald-400/20 hover:bg-emerald-400/35 text-emerald-200 text-[11px] font-black flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar (.txt)</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <div className="p-2 rounded-xl bg-white/5 text-emerald-200 tabular-nums">
                Aprendizaje hoy: {progress.analytics?.learnMinutesToday ?? 0} min
              </div>
              <div className="p-2 rounded-xl bg-white/5 text-amber-200 tabular-nums">
                Cine hoy: {progress.analytics?.cinemaMinutesToday ?? 0} min
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-black">
              {(
                [
                  { key: 'lang', label: 'Idiomas', bar: 'bg-sky-400' },
                  { key: 'math', label: 'Mates', bar: 'bg-amber-400' },
                  { key: 'music', label: 'Música', bar: 'bg-emerald-400' },
                  { key: 'logic', label: 'Lógica', bar: 'bg-pink-400' },
                ] as const
              ).map((d) => {
                const ok = progress.analytics?.domainCorrect[d.key] ?? 0;
                const tot = progress.analytics?.domainTotal[d.key] ?? 0;
                const pct = tot > 0 ? Math.round((ok / tot) * 100) : 0;
                return (
                  <div key={d.key} className="space-y-1">
                    <div className="flex justify-between text-sky-100">
                      <span>{d.label}</span>
                      <span className="tabular-nums">{tot > 0 ? `${pct}%` : '—'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full ${d.bar} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] font-bold text-amber-200 bg-amber-400/10 border border-amber-300/25 rounded-xl px-2.5 py-2">
              Consejo de hoy: practicad en la mesa las palabras &ldquo;Aman&rdquo; (agua) y &ldquo;Aɣrum&rdquo; (pan) en voz alta.
            </div>
          </div>

          <KidsApkInstallCard />

          {onOpenSmartTv && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSmartTv();
              }}
              className="w-full h-11 rounded-xl bg-amber-400/20 hover:bg-amber-400/35 border border-amber-400/45 text-amber-200 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Cast className="w-4 h-4" />
              <span>{t.connectSmartTv}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFamilyOnboarding();
            }}
            className="w-full h-11 rounded-xl bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/40 text-purple-200 text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
          >
            <Users className="w-4 h-4 text-purple-300" />
            <span>Configurar Hermanos y Familia (Nombres, Edades y Avatares)</span>
          </button>
        </div>

        <div className="shrink-0 grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-sky-400 text-black font-display font-extrabold text-xs cursor-pointer"
          >
            {t.saveAndBack}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onExitKids();
            }}
            className="h-11 rounded-xl bg-rose-500/25 border border-rose-400/50 text-rose-100 font-display font-extrabold text-xs cursor-pointer"
          >
            {t.exitKids}
          </button>
        </div>
      </div>
    </div>
  );
};
