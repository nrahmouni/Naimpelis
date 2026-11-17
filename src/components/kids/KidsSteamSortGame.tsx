import React, { useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';

export type SteamBucketId = 'forest' | 'ocean' | 'space';

export interface SteamItem {
  id: string;
  emoji: string;
  bucket: SteamBucketId;
  labels: Record<KidsLanguageCode, string>;
}

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Validación estricta de colisión por límites en el DOM.
 * Devuelve el bucket cuyo Rect contenga el punto (x, y) soltado.
 */
export function findCollidingSteamBucket(
  dropX: number,
  dropY: number,
  bucketRects: Partial<Record<SteamBucketId, RectLike>>
): SteamBucketId | null {
  const ids: SteamBucketId[] = ['forest', 'ocean', 'space'];
  for (const id of ids) {
    const r = bucketRects[id];
    if (!r) continue;
    if (dropX >= r.left && dropX <= r.right && dropY >= r.top && dropY <= r.bottom) {
      return id;
    }
  }
  return null;
}

const STEAM_BANK: SteamItem[] = [
  {
    id: 'fox',
    emoji: '🦊',
    bucket: 'forest',
    labels: {
      es: 'Zorro',
      ca: 'Guineu',
      en: 'Fox',
      nl: 'Vos',
      fr: 'Renard',
      ar: 'ثعلب',
      rif: 'Abareɣ',
      zh: '狐狸',
    },
  },
  {
    id: 'pine',
    emoji: '🌲',
    bucket: 'forest',
    labels: {
      es: 'Pino',
      ca: 'Pi',
      en: 'Pine Tree',
      nl: 'Pijnboom',
      fr: 'Sapin',
      ar: 'صنوبر',
      rif: 'Tayda',
      zh: '松树',
    },
  },
  {
    id: 'owl',
    emoji: '🦉',
    bucket: 'forest',
    labels: {
      es: 'Búho',
      ca: 'Mussol',
      en: 'Owl',
      nl: 'Uil',
      fr: 'Hibou',
      ar: 'بومة',
      rif: 'Muka',
      zh: '猫头鹰',
    },
  },
  {
    id: 'whale',
    emoji: '🐳',
    bucket: 'ocean',
    labels: {
      es: 'Ballena',
      ca: 'Balena',
      en: 'Whale',
      nl: 'Walvis',
      fr: 'Baleine',
      ar: 'حوت',
      rif: 'Lḥut ameqqran',
      zh: '鲸鱼',
    },
  },
  {
    id: 'octopus',
    emoji: '🐙',
    bucket: 'ocean',
    labels: {
      es: 'Pulpo',
      ca: 'Pop',
      en: 'Octopus',
      nl: 'Octopus',
      fr: 'Poulpe',
      ar: 'أخطبوط',
      rif: 'Azayez',
      zh: '章鱼',
    },
  },
  {
    id: 'fish',
    emoji: '🐠',
    bucket: 'ocean',
    labels: {
      es: 'Pez',
      ca: 'Peix',
      en: 'Fish',
      nl: 'Vis',
      fr: 'Poisson',
      ar: 'سمكة',
      rif: 'Aslem',
      zh: '小鱼',
    },
  },
  {
    id: 'rocket',
    emoji: '🚀',
    bucket: 'space',
    labels: {
      es: 'Cohete',
      ca: 'Coet',
      en: 'Rocket',
      nl: 'Raket',
      fr: 'Fusée',
      ar: 'صاروخ',
      rif: 'Ṣṣarux',
      zh: '火箭',
    },
  },
  {
    id: 'saturn',
    emoji: '🪐',
    bucket: 'space',
    labels: {
      es: 'Planeta',
      ca: 'Planeta',
      en: 'Planet',
      nl: 'Planeet',
      fr: 'Planète',
      ar: 'كوكب',
      rif: 'Lkwakib',
      zh: '行星',
    },
  },
  {
    id: 'astronaut',
    emoji: '👩‍🚀',
    bucket: 'space',
    labels: {
      es: 'Astronauta',
      ca: 'Astronauta',
      en: 'Astronaut',
      nl: 'Astronaut',
      fr: 'Astronaute',
      ar: 'رائد فضاء',
      rif: 'Amessafar n jenna',
      zh: '宇航员',
    },
  },
];

interface KidsSteamSortGameProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
}

export const KidsSteamSortGame: React.FC<KidsSteamSortGameProps> = ({
  kidsLang,
  ageGroup,
  onEarnStar,
  onMissionLearn,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const roundSize = ageGroup === '3-5' ? 6 : 9;
  const [roundSeed, setRoundSeed] = useState(1);
  const [sortedIds, setSortedIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confettiActive, setConfettiActive] = useState(false);
  const [dragging, setDragging] = useState<{
    item: SteamItem;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<SteamBucketId | null>(null);

  const bucketRefs = useRef<Partial<Record<SteamBucketId, HTMLButtonElement | null>>>({});

  const items = useMemo(() => {
    const pool = [...STEAM_BANK].sort(() => Math.random() - 0.5);
    return pool.slice(0, roundSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundSeed, roundSize]);

  const remainingItems = items.filter((it) => !sortedIds.includes(it.id));
  const isVictory = sortedIds.length === items.length && items.length > 0;

  const getBucketRects = (): Partial<Record<SteamBucketId, RectLike>> => {
    const out: Partial<Record<SteamBucketId, RectLike>> = {};
    (['forest', 'ocean', 'space'] as SteamBucketId[]).forEach((id) => {
      const el = bucketRefs.current[id];
      if (el) {
        const r = el.getBoundingClientRect();
        out[id] = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }
    });
    return out;
  };

  const evaluateDrop = (item: SteamItem, targetBucket: SteamBucketId) => {
    if (item.bucket === targetBucket) {
      triggerHaptic('success');
      playKidsSound('success', ux.soundEnabled, true);
      const nextSorted = [...sortedIds, item.id];
      setSortedIds(nextSorted);
      setSelectedItemId(null);
      setStatusMsg(`✅ ${item.emoji} ${item.labels[kidsLang]}`);
      onMissionLearn?.();
      onEarnStar(1, 'science_curious');

      if (nextSorted.length === items.length) {
        setConfettiActive(true);
        playKidsSound('levelUp', ux.soundEnabled, true);
        onEarnStar(3, 'science_curious');
        if (ux.soundEnabled) {
          void speakKidsText(t.steamVictoryTitle, kidsLang, { ageGroup });
        }
      }
    } else {
      triggerHaptic('warning');
      playKidsSound('error', ux.soundEnabled, true);
      setStatusMsg(t.steamWrongBucket);
    }
  };

  const handleRestart = () => {
    triggerHaptic('light');
    setSortedIds([]);
    setSelectedItemId(null);
    setStatusMsg(null);
    setConfettiActive(false);
    setRoundSeed((s) => s + 1);
  };

  const buckets: Array<{
    id: SteamBucketId;
    emoji: string;
    label: string;
    gradient: string;
    border: string;
  }> = [
    {
      id: 'forest',
      emoji: '🌲',
      label: t.steamForest,
      gradient: 'from-emerald-600/35 to-green-900/45',
      border: 'border-emerald-400/50',
    },
    {
      id: 'ocean',
      emoji: '🌊',
      label: t.steamOcean,
      gradient: 'from-sky-500/35 to-blue-900/45',
      border: 'border-sky-400/50',
    },
    {
      id: 'space',
      emoji: '🚀',
      label: t.steamSpace,
      gradient: 'from-violet-600/35 to-indigo-950/55',
      border: 'border-violet-400/50',
    },
  ];

  return (
    <div
      dir={dir}
      className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-3 flex flex-col gap-2.5 overflow-hidden relative select-none"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* Top instruction bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#0F152B] border border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <KidsSpeakButton text={t.steamRule} lang={kidsLang} size="md" />
          <span className="text-xs sm:text-sm font-black text-sky-100 truncate">
            {statusMsg || t.steamRule}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
            {sortedIds.length}/{items.length}
          </span>
          <button
            type="button"
            onClick={handleRestart}
            aria-label={t.gameRetryBtn}
            className="min-h-11 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Playfield or Victory */}
      {isVictory ? (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#0D132B] border-2 border-emerald-400/40 flex flex-col items-center justify-center gap-3 p-5 text-center">
          <div className="text-5xl">🧪</div>
          <h3 className="font-display font-black text-2xl sm:text-3xl text-emerald-300">
            {t.steamVictoryTitle}
          </h3>
          <p className="text-sm sm:text-base font-bold text-white max-w-sm">
            {t.steamVictoryBody} (+4 ⭐)
          </p>
          <KidsSquishButton
            onClick={handleRestart}
            className="px-6 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-base"
          >
            {t.gameRetryBtn}
          </KidsSquishButton>
        </div>
      ) : (
        <>
          {/* Draggable / Tappable Cards Tray */}
          <div className="flex-1 min-h-0 rounded-2xl bg-[#0D132B] border border-white/10 p-3 flex flex-wrap items-center justify-center content-center gap-2.5 overflow-hidden">
            {remainingItems.map((item) => {
              const isSelected = selectedItemId === item.id;
              const isBeingDragged = dragging?.item.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    triggerHaptic('light');
                    setSelectedItemId(item.id);
                    setDragging({ item, x: e.clientX, y: e.clientY });
                    if (ux.soundEnabled) {
                      void speakKidsText(item.labels[kidsLang], kidsLang, { ageGroup });
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!dragging || dragging.item.id !== item.id) return;
                    setDragging({ item, x: e.clientX, y: e.clientY });
                    const over = findCollidingSteamBucket(
                      e.clientX,
                      e.clientY,
                      getBucketRects()
                    );
                    setHoveredBucket(over);
                  }}
                  onPointerUp={(e) => {
                    if (!dragging || dragging.item.id !== item.id) return;
                    const dropBucket = findCollidingSteamBucket(
                      e.clientX,
                      e.clientY,
                      getBucketRects()
                    );
                    setDragging(null);
                    setHoveredBucket(null);
                    if (dropBucket) {
                      evaluateDrop(item, dropBucket);
                    }
                  }}
                  onPointerCancel={() => {
                    setDragging(null);
                    setHoveredBucket(null);
                  }}
                  className={`min-w-[88px] min-h-[82px] px-3 py-2 rounded-2xl border-2 border-b-4 flex flex-col items-center justify-center gap-1 touch-none cursor-grab active:cursor-grabbing transition-transform ${
                    isBeingDragged
                      ? 'opacity-30 scale-95 border-amber-300'
                      : isSelected
                      ? 'bg-amber-400/20 border-amber-300 scale-105'
                      : 'bg-[#1B254D] hover:bg-[#243266] border-[#33448A]'
                  }`}
                >
                  <span className="text-3xl sm:text-4xl pointer-events-none">{item.emoji}</span>
                  <span className="text-xs font-black text-white pointer-events-none">
                    {item.labels[kidsLang]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3 Drop Target Containers (DOM collision bounds) */}
          <div className="shrink-0 grid grid-cols-3 gap-2.5">
            {buckets.map((b) => {
              const isOver = hoveredBucket === b.id;
              const matchedHere = items.filter(
                (it) => it.bucket === b.id && sortedIds.includes(it.id)
              );
              return (
                <button
                  key={b.id}
                  ref={(el) => {
                    bucketRefs.current[b.id] = el;
                  }}
                  type="button"
                  onClick={() => {
                    const picked = remainingItems.find((it) => it.id === selectedItemId);
                    if (picked) {
                      evaluateDrop(picked, b.id);
                    }
                  }}
                  className={`min-h-[96px] sm:min-h-[112px] p-2.5 rounded-2xl bg-gradient-to-b ${b.gradient} border-2 ${
                    isOver
                      ? 'border-amber-300 ring-2 ring-amber-400 scale-[1.03]'
                      : b.border
                  } flex flex-col items-center justify-between gap-1 cursor-pointer transition-all`}
                >
                  <span className="text-2xl sm:text-3xl">{b.emoji}</span>
                  <span className="font-display font-black text-xs sm:text-sm text-white">
                    {b.label}
                  </span>
                  <div className="flex items-center justify-center gap-1 min-h-[20px] flex-wrap">
                    {matchedHere.length > 0 ? (
                      matchedHere.map((m) => (
                        <span key={m.id} className="text-base sm:text-lg">
                          {m.emoji}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-white/65 font-bold">
                        {selectedItemId || isOver ? t.steamDropHere : '···'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Floating Drag Ghost following finger/cursor */}
      {dragging && (
        <div
          style={{
            position: 'fixed',
            left: dragging.x,
            top: dragging.y,
            transform: 'translate(-50%, -50%) scale(1.12)',
            zIndex: 320,
            pointerEvents: 'none',
          }}
          className="px-4 py-2.5 rounded-2xl bg-[#1D2859]/95 border-2 border-amber-300 shadow-2xl flex flex-col items-center gap-0.5"
        >
          <span className="text-4xl">{dragging.item.emoji}</span>
          <span className="text-xs font-black text-amber-200">
            {dragging.item.labels[kidsLang]}
          </span>
        </div>
      )}
    </div>
  );
};
