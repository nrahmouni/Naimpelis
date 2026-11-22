import React, { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { useBackInterceptor } from '../../lib/backInterceptor';

export type A11yPoliteness = 'polite' | 'assertive';

interface A11yAnnouncementDetail {
  message: string;
  priority: A11yPoliteness;
}

const A11Y_ANNOUNCE_EVENT = 'riffan:a11y-announce';
const OPEN_SHORTCUTS_EVENT = 'riffan:open-shortcuts';

export function announceScreenReader(message: string, priority: A11yPoliteness = 'polite'): void {
  if (typeof window === 'undefined' || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent<A11yAnnouncementDetail>(A11Y_ANNOUNCE_EVENT, {
      detail: { message: message.trim(), priority },
    })
  );
}

export function openKeyboardShortcutsModal(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_EVENT));
}

export const SkipToContentLink: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  return (
    <a
      href="#main-world-content"
      onClick={(e) => {
        const target = document.getElementById('main-world-content');
        if (target) {
          e.preventDefault();
          target.focus({ preventScroll: false });
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[260] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-[#7C3AED] focus:text-white focus:font-bold focus:text-xs focus:shadow-[0_12px_30px_rgba(0,0,0,0.9)]"
    >
      {pickLang(lang, {
        es: 'Saltar al contenido principal',
        ca: 'Saltar al contingut principal',
        en: 'Skip to main content',
        rif: 'Nḍew ɣer umaynut amezwaru',
      })}
    </a>
  );
};

interface ShortcutDef {
  keys: string[];
  label: { es: string; ca: string; en: string; rif?: string };
}

const KEYBOARD_SHORTCUTS: ShortcutDef[] = [
  { keys: ['Space', 'K'], label: { es: 'Reproducir / Pausar vídeo o música', ca: 'Reproduir / Pausar vídeo o música', en: 'Play / Pause video or music', rif: 'Cɛel / Ḥbes lvidyu niɣ lmusiqa' } },
  { keys: ['J', '←'], label: { es: 'Retroceder 10 segundos', ca: 'Retrocedir 10 segons', en: 'Rewind 10 seconds', rif: 'Ɛeqeb 10 n tsnin' } },
  { keys: ['L', '→'], label: { es: 'Avanzar 10 segundos', ca: 'Avançar 10 segons', en: 'Forward 10 seconds', rif: 'Zid 10 n tsnin' } },
  { keys: ['M'], label: { es: 'Silenciar / Activar sonido', ca: 'Silenciar / Activar so', en: 'Mute / Unmute audio', rif: 'Semmet / Cɛel ṣṣut' } },
  { keys: ['F'], label: { es: 'Pantalla completa', ca: 'Pantalla completa', en: 'Fullscreen mode', rif: 'Ccaca ikemmlen' } },
  { keys: ['P'], label: { es: 'Imagen en imagen (PiP)', ca: 'Imatge en imatge (PiP)', en: 'Picture-in-Picture (PiP)', rif: 'Tawlaft di tawlaft (PiP)' } },
  { keys: ['C'], label: { es: 'Alternar subtítulos', ca: 'Commutar subtítols', en: 'Toggle captions / subtitles', rif: 'Beddel tirra' } },
  { keys: ['?'], label: { es: 'Mostrar / Ocultar esta guía de atajos', ca: 'Mostrar / Amagar aquesta guia', en: 'Show / Hide shortcuts guide', rif: 'Sken / Ffer imsefra' } },
  { keys: ['Esc'], label: { es: 'Cerrar menú o modal activo', ca: 'Tancar menú o modal actiu', en: 'Close active menu or dialog', rif: 'Qqen umuɣ niɣ modal' } },
];

export const GlobalA11yHost: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const [politeMsg, setPoliteMsg] = useState('');
  const [assertiveMsg, setAssertiveMsg] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useBackInterceptor(shortcutsOpen, 'global-shortcuts-modal', () => setShortcutsOpen(false), {
    priority: 30,
  });

  useEffect(() => {
    let politeTimer: number | undefined;
    let assertiveTimer: number | undefined;

    const onAnnounce = (ev: Event) => {
      const detail = (ev as CustomEvent<A11yAnnouncementDetail>).detail;
      if (!detail?.message) return;
      if (detail.priority === 'assertive') {
        setAssertiveMsg('');
        window.clearTimeout(assertiveTimer);
        window.setTimeout(() => setAssertiveMsg(detail.message), 20);
        assertiveTimer = window.setTimeout(() => setAssertiveMsg(''), 4500);
      } else {
        setPoliteMsg('');
        window.clearTimeout(politeTimer);
        window.setTimeout(() => setPoliteMsg(detail.message), 20);
        politeTimer = window.setTimeout(() => setPoliteMsg(''), 4500);
      }
    };

    const onOpenShortcuts = () => setShortcutsOpen(true);

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(target?.isContentEditable);

      if (e.key === '?' && !isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
      }
    };

    window.addEventListener(A11Y_ANNOUNCE_EVENT, onAnnounce);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onOpenShortcuts);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(politeTimer);
      window.clearTimeout(assertiveTimer);
      window.removeEventListener(A11Y_ANNOUNCE_EVENT, onAnnounce);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, onOpenShortcuts);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcutsOpen]);

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {politeMsg}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertiveMsg}
      </div>

      {shortcutsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rtv-shortcuts-title"
          className="fixed inset-0 z-[240] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-[#0D0D12] border border-white/15 shadow-[0_24px_70px_rgba(0,0,0,0.92)] p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-2xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#C4B5FD]">
                  <Keyboard className="w-4 h-4" />
                </span>
                <div>
                  <h2 id="rtv-shortcuts-title" className="text-base font-bold text-white">
                    {pickLang(lang, {
                      es: 'Atajos de teclado',
                      ca: 'Dreceres de teclat',
                      en: 'Keyboard shortcuts',
                      rif: 'Imsefra n tufrawt',
                    })}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {pickLang(lang, {
                      es: 'Control rápido de reproducción y navegación',
                      ca: 'Control ràpid de reproducció i navegació',
                      en: 'Fast playback and navigation controls',
                      rif: 'Aseddu d arurad n lvidyu',
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                autoFocus
                aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
                onClick={() => setShortcutsOpen(false)}
                className="min-h-10 min-w-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {KEYBOARD_SHORTCUTS.map((sc) => (
                <div key={sc.keys.join('+')} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-xs sm:text-sm text-zinc-200">
                    {pickLang(lang, sc.label)}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sc.keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-2 py-1 rounded-lg bg-[#181822] border border-white/15 text-[11px] font-mono font-semibold text-white shadow-sm"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
