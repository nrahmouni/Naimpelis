import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { triggerHaptic } from '../../utils/haptics';
import { MUSIC_LANGUAGES, type MusicLang } from './musicI18n';

const MusicLangFlag: React.FC<{ lang: MusicLang }> = ({ lang }) => {
  switch (lang) {
    case 'en':
      return (
        <svg viewBox="0 0 24 16" className="w-4 h-3 rounded-[2.5px] shrink-0 shadow-sm" aria-hidden="true">
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#FFFFFF" strokeWidth="2.8" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.4" />
          <path d="M12 0V16M0 8H24" stroke="#FFFFFF" strokeWidth="4.6" />
          <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="2.6" />
        </svg>
      );
    case 'es':
      return (
        <svg viewBox="0 0 24 16" className="w-4 h-3 rounded-[2.5px] shrink-0 shadow-sm" aria-hidden="true">
          <rect width="24" height="16" fill="#AA151B" />
          <rect y="4" width="24" height="8" fill="#F1BF00" />
        </svg>
      );
    case 'fr':
      return (
        <svg viewBox="0 0 24 16" className="w-4 h-3 rounded-[2.5px] shrink-0 shadow-sm" aria-hidden="true">
          <rect width="8" height="16" fill="#002395" />
          <rect x="8" width="8" height="16" fill="#FFFFFF" />
          <rect x="16" width="8" height="16" fill="#ED2939" />
        </svg>
      );
    case 'zh':
      return (
        <svg viewBox="0 0 24 16" className="w-4 h-3 rounded-[2.5px] shrink-0 shadow-sm" aria-hidden="true">
          <rect width="24" height="16" fill="#DE2910" />
          <polygon points="5,2.4 5.7,4.5 7.9,4.5 6.1,5.8 6.8,7.9 5,6.6 3.2,7.9 3.9,5.8 2.1,4.5 4.3,4.5" fill="#FFDE00" />
          <circle cx="9.6" cy="2.6" r="0.7" fill="#FFDE00" />
          <circle cx="11" cy="4.4" r="0.7" fill="#FFDE00" />
          <circle cx="11" cy="6.6" r="0.7" fill="#FFDE00" />
          <circle cx="9.6" cy="8.4" r="0.7" fill="#FFDE00" />
        </svg>
      );
    case 'ca':
      return (
        <svg viewBox="0 0 24 16" className="w-4 h-3 rounded-[2.5px] shrink-0 shadow-sm" aria-hidden="true">
          <rect width="24" height="16" fill="#FCDD09" />
          <rect y="1.78" width="24" height="1.78" fill="#DA121A" />
          <rect y="5.33" width="24" height="1.78" fill="#DA121A" />
          <rect y="8.89" width="24" height="1.78" fill="#DA121A" />
          <rect y="12.44" width="24" height="1.78" fill="#DA121A" />
        </svg>
      );
  }
};

export const MusicLanguageDropdown: React.FC = () => {
  const musicLang = useMusicStore((s) => s.musicLang);
  const setMusicLang = useMusicStore((s) => s.setMusicLang);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const active = MUSIC_LANGUAGES.find((l) => l.id === musicLang) || MUSIC_LANGUAGES[0];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={active.label}
        className={`h-7 sm:h-7 px-2 rounded-full inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide cursor-pointer transition-all whitespace-nowrap ${
          open
            ? 'bg-[#3B82F6]/24 text-[#93C5FD]'
            : 'hover:bg-[#3B82F6]/16 text-slate-100 hover:text-white'
        }`}
      >
        <MusicLangFlag lang={active.id} />
        <span>{active.code}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${open ? 'rotate-180 text-[#93C5FD]' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Language"
          className="absolute right-0 mt-2 w-44 rounded-2xl bg-[#0C0C0F]/98 backdrop-blur-2xl border border-[#3B82F6]/25 shadow-[0_18px_48px_rgba(0,0,0,0.85)] p-1.5 space-y-0.5 z-50 animate-fade-in"
        >
          {MUSIC_LANGUAGES.map((item) => {
            const selected = item.id === musicLang;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  triggerHaptic('light');
                  setMusicLang(item.id);
                  setOpen(false);
                }}
                className={`w-full min-h-10 px-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold cursor-pointer transition-colors ${
                  selected
                    ? 'bg-[#3B82F6]/20 text-[#93C5FD]'
                    : 'text-zinc-200 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <MusicLangFlag lang={item.id} />
                  <span className="truncate">{item.label}</span>
                </span>
                {selected && <Check className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
