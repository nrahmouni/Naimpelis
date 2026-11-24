import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search, Tv, Volume2 } from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchboardItem,
  MultiScreenSourceInput,
  SecondaryStreamState,
} from '../../types';
import { BottomSheet } from '../ui/DesignSystem';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  formatOffsetDateKey,
  hasValidScore,
  TeamCrestImg,
} from './FootballMatchboardParts';
import {
  matchesFootballSearchFilter,
  normalizeFootballText,
  pickPreferredChannelIndex,
} from './FootballMatchboardHelpers';

interface QuickAddMatchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  currentPrimaryTitle?: string;
  currentPrimaryMatchId?: string;
  secondaryStreams: SecondaryStreamState[];
  activeAudioSlot?: number;
  onAddMatch: (source: MultiScreenSourceInput) => void;
  onFocusSlot?: (slotIdx: number) => void;
}

export const QuickAddMatchSheet: React.FC<QuickAddMatchSheetProps> = ({
  isOpen,
  onClose,
  lang,
  currentPrimaryTitle = '',
  currentPrimaryMatchId = '',
  secondaryStreams,
  activeAudioSlot = 0,
  onAddMatch,
  onFocusSlot,
}) => {
  const [matches, setMatches] = useState<FootballMatchboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyLive, setOnlyLive] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    const todayKey = formatOffsetDateKey(0).dateKey;

    Promise.allSettled([
      fetch(`/api/sports/football-board?date=${encodeURIComponent(todayKey)}&lang=${encodeURIComponent(lang)}`).then(
        (r) => (r.ok ? r.json() : null)
      ),
      fetch(`/api/sports/champions-hub?lang=${encodeURIComponent(lang)}`).then(
        (r) => (r.ok ? r.json() : null)
      ),
    ])
      .then(([boardRes, uclRes]) => {
        if (cancelled) return;
        const map = new Map<string, FootballMatchboardItem>();
        const ingest = (list: unknown) => {
          if (!Array.isArray(list)) return;
          for (const raw of list as FootballMatchboardItem[]) {
            if (!raw || !Array.isArray(raw.channels) || raw.channels.length === 0) continue;
            const pairKey = `${normalizeFootballText(raw.homeTeam)}::${normalizeFootballText(raw.awayTeam)}`;
            const existing = map.get(pairKey);
            if (!existing || (raw.channels.length > existing.channels.length)) {
              map.set(pairKey, raw);
            }
          }
        };
        if (uclRes.status === 'fulfilled') ingest(uclRes.value?.matches);
        if (boardRes.status === 'fulfilled') ingest(boardRes.value?.matches);

        const sorted = Array.from(map.values()).sort((a, b) => {
          const liveScore = (m: FootballMatchboardItem) => (m.statusState === 'live' ? 0 : m.statusState === 'upcoming' ? 1 : 2);
          const diff = liveScore(a) - liveScore(b);
          if (diff !== 0) return diff;
          return (a.kickoffMs || 0) - (b.kickoffMs || 0);
        });
        setMatches(sorted);
        const hasAnyLive = sorted.some((m) => m.statusState === 'live');
        if (!hasAnyLive) setOnlyLive(false);
      })
      .catch(() => {
        // keep any prior list
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, lang]);

  const totalScreens = 1 + secondaryStreams.length;
  const nextSlotNumber = Math.min(4, totalScreens + 1);
  const normalizedPrimaryTitle = normalizeFootballText(currentPrimaryTitle);

  const getActiveSlotForItem = (item: FootballMatchboardItem): number | null => {
    const itemNormTitle = normalizeFootballText(`${item.homeTeam} vs ${item.awayTeam}`);
    if (
      (currentPrimaryMatchId &&
        (item.id === currentPrimaryMatchId || item.eventId === currentPrimaryMatchId)) ||
      (normalizedPrimaryTitle && itemNormTitle && normalizedPrimaryTitle === itemNormTitle)
    ) {
      return 0;
    }
    for (let i = 0; i < secondaryStreams.length; i++) {
      const sec = secondaryStreams[i];
      if (
        (sec.matchId && (sec.matchId === item.id || sec.matchId === item.eventId)) ||
        normalizeFootballText(sec.title) === itemNormTitle
      ) {
        return i + 1;
      }
    }
    return null;
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (onlyLive && m.statusState !== 'live') return false;
      if (query.trim() && !matchesFootballSearchFilter(m, query)) return false;
      return true;
    });
  }, [matches, onlyLive, query]);

  const handleSelectMatch = (item: FootballMatchboardItem) => {
    const activeSlot = getActiveSlotForItem(item);
    if (activeSlot !== null) {
      triggerHaptic('light');
      onFocusSlot?.(activeSlot);
      onClose();
      return;
    }

    const playable = (item.channels || []).filter((c) => Boolean(c.sourceUrl));
    if (playable.length === 0) return;

    const preferredIdx = pickPreferredChannelIndex(playable, lang);
    const ordered = [
      playable[preferredIdx] || playable[0],
      ...playable.filter((_, i) => i !== preferredIdx),
    ].filter(Boolean);

    triggerHaptic('medium');
    onAddMatch({
      title: `${item.homeTeam} vs ${item.awayTeam}`,
      subtitle: `${item.groupTitle || item.leagueName || 'Fútbol HD'} · ${ordered[0].label}`,
      sourceUrl: ordered[0].sourceUrl,
      fallbackUrls: ordered.slice(1).map((c) => c.sourceUrl),
      matchId: item.id,
      forceLayout: 'split',
    });
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={pickLang(lang, {
        es: `Añadir partido (${totalScreens}/4 pantallas)`,
        ca: `Afegir partit (${totalScreens}/4 pantalles)`,
        en: `Add match (${totalScreens}/4 screens)`,
      })}
      subtitle={pickLang(lang, {
        es: 'Elige otro partido en directo para verlo a la vez en pantalla dividida',
        ca: 'Tria un altre partit en directe per veure’l alhora en pantalla dividida',
        en: 'Pick another live match to watch side-by-side in split view',
      })}
      maxWidth="sm:max-w-xl"
      lang={lang}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pickLang(lang, {
                es: 'Buscar equipo o liga...',
                ca: 'Cercar equip o lliga...',
                en: 'Search team or league...',
              })}
              className="w-full min-h-10 pl-8 pr-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#9146FF]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOnlyLive(true)}
              className={`min-h-10 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                onlyLive
                  ? 'bg-rose-500/20 border-rose-500/45 text-rose-200'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              {pickLang(lang, { es: 'En directo', ca: 'En directe', en: 'Live' })}
            </button>
            <button
              type="button"
              onClick={() => setOnlyLive(false)}
              className={`min-h-10 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                !onlyLive
                  ? 'bg-[#9146FF]/25 border-[#9146FF]/50 text-white'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              {pickLang(lang, { es: 'Todos hoy', ca: 'Tots avui', en: 'All today' })}
            </button>
          </div>
        </div>

        {loading && matches.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-[#9146FF]" />
            <span>
              {pickLang(lang, {
                es: 'Buscando partidos disponibles...',
                ca: 'Cercant partits disponibles...',
                en: 'Finding available matches...',
              })}
            </span>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
            <Tv className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-xs text-zinc-300 font-medium">
              {onlyLive
                ? pickLang(lang, {
                    es: 'No hay más partidos en directo con señal abierta en este momento.',
                    ca: 'No hi ha més partits en directe amb senyal ara mateix.',
                    en: 'No more live matches with active feeds right now.',
                  })
                : pickLang(lang, {
                    es: 'No hay partidos que coincidan con tu búsqueda.',
                    ca: 'No hi ha partits que coincideixin amb la cerca.',
                    en: 'No matches found for your search.',
                  })}
            </p>
            {onlyLive && (
              <button
                type="button"
                onClick={() => setOnlyLive(false)}
                className="min-h-9 px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer"
              >
                {pickLang(lang, { es: 'Ver todos los de hoy', ca: 'Veure tots els d’avui', en: 'Show all today' })}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5">
            {filteredMatches.map((item) => {
              const slotIdx = getActiveSlotForItem(item);
              const isSelected = slotIdx !== null;
              const isAudioHere = isSelected && activeAudioSlot === slotIdx;
              const showScore = hasValidScore(item.homeScore, item.awayScore);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectMatch(item)}
                  className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-emerald-500/[0.12] border-emerald-400/45'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08]'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      {item.statusState === 'live' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                          {item.statusLabel || 'EN VIVO'}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300">
                          {item.kickoffTime}
                        </span>
                      )}
                      <span className="text-zinc-400 truncate">
                        {item.leagueName || item.groupTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <TeamCrestImg
                        src={item.homeLogo}
                        shortCode={item.homeShort}
                        alt={item.homeTeam}
                      />
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {item.homeTeam}
                        {showScore ? ` ${item.homeScore}–${item.awayScore} ` : ' vs '}
                        {item.awayTeam}
                      </span>
                      <TeamCrestImg
                        src={item.awayLogo}
                        shortCode={item.awayShort}
                        alt={item.awayTeam}
                      />
                    </div>
                  </div>

                  <span
                    className={`min-h-9 px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 ${
                      isSelected
                        ? 'bg-emerald-500 text-black'
                        : 'bg-[#7C3AED] hover:bg-[#8B5CF6] text-white'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        {isAudioHere ? (
                          <Volume2 className="w-3.5 h-3.5" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>P{slotIdx + 1}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {totalScreens >= 4
                            ? pickLang(lang, { es: 'Cambiar P4', ca: 'Canviar P4', en: 'Swap P4' })
                            : `P${nextSlotNumber}`}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
