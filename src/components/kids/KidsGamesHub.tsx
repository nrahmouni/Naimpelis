import React, { useState } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsAnimatedCategoryIcon, type KidsAnimatedIconId } from './KidsSvgArt';
import { KidsStarCatcherGame } from './KidsStarCatcherGame';
import { KidsMathBubblesGame } from './KidsMathBubblesGame';
import { KidsMemoryGame } from './KidsMemoryGame';
import { KidsSimonGame } from './KidsSimonGame';

import gameCoverStarsImg from '../../assets/images/kids_game_stars_1794942856889.jpg';
import gameCoverMathImg from '../../assets/images/kids_game_math_1794942857625.jpg';
import gameCoverMemoryImg from '../../assets/images/kids_game_memory_1794942858713.jpg';
import gameCoverSimonImg from '../../assets/images/kids_game_simon_1794942858031.jpg';

export type KidsPolishedGameId = 'stars' | 'math' | 'memory' | 'simon';

interface KidsGamesHubProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  profileId: string;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
  onBackToPortal?: () => void;
}

export const KidsGamesHub: React.FC<KidsGamesHubProps> = ({
  kidsLang,
  ageGroup,
  profileId,
  unlockedRewards,
  onEarnStar,
  onMissionPlay,
}) => {
  const soundEnabled = useKidsStore((s) => s.ux.soundEnabled);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const [activeGame, setActiveGame] = useState<KidsPolishedGameId | null>(null);

  const GAME_CARDS: Array<{
    id: KidsPolishedGameId;
    kicker: string;
    title: string;
    desc: string;
    icon: KidsAnimatedIconId;
    coverImg: string;
    borderTone: string;
    accentText: string;
    playBtnBg: string;
  }> = [
    {
      id: 'stars',
      kicker: 'ESPACIO · VOCABULARIO',
      title: t.funStars,
      desc: 'Atrapa cápsulas del idioma que pide tu radio espacial en 8 idiomas.',
      icon: 'space',
      coverImg: gameCoverStarsImg,
      borderTone: 'border-amber-400/45 hover:border-amber-300',
      accentText: 'text-amber-300',
      playBtnBg: 'bg-amber-400 text-slate-950',
    },
    {
      id: 'math',
      kicker: 'MATES · BÁSCULA · 2P',
      title: t.tabMath,
      desc: 'Burbujas, balanza Montessori, fracciones con pizza, reloj y duelo 2 hermanos.',
      icon: 'math',
      coverImg: gameCoverMathImg,
      borderTone: 'border-sky-400/45 hover:border-sky-300',
      accentText: 'text-sky-300',
      playBtnBg: 'bg-sky-400 text-slate-950',
    },
    {
      id: 'memory',
      kicker: 'MEMORIA · COCINA · LÓGICA',
      title: t.tabMemory,
      desc: 'Cofre de 60 palabras, restaurante multilingüe y rutas de programación.',
      icon: 'memory',
      coverImg: gameCoverMemoryImg,
      borderTone: 'border-pink-400/45 hover:border-pink-300',
      accentText: 'text-pink-300',
      playBtnBg: 'bg-pink-400 text-slate-950',
    },
    {
      id: 'simon',
      kicker: 'PIANO · MELODÍAS · ECO',
      title: t.funSimon,
      desc: 'Toca canciones reales con 8 notas musicales, eco clásico y synth.',
      icon: 'simon',
      coverImg: gameCoverSimonImg,
      borderTone: 'border-emerald-400/45 hover:border-emerald-300',
      accentText: 'text-emerald-300',
      playBtnBg: 'bg-emerald-400 text-slate-950',
    },
  ];

  const activeMeta = GAME_CARDS.find((g) => g.id === activeGame);

  return (
    <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {/* Only show sub-bar when inside an active game — Hub uses RiffanKidsHub header cleanly */}
      {activeGame && (
        <div className="shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <KidsSquishButton
              onClick={() => {
                triggerHaptic('light');
                playKidsSound('tap', soundEnabled, true);
                setActiveGame(null);
              }}
              className="!min-h-[40px] h-10 px-3 rounded-xl bg-[#182352] hover:bg-[#253268] border-b-4 border-[#0F1635] text-white font-black text-xs flex items-center gap-1 shrink-0"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              <span>{t.navFun}</span>
            </KidsSquishButton>

            <h2 className="font-display font-black text-sm sm:text-lg text-white truncate">
              {activeMeta?.title}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {GAME_CARDS.map((g) => (
              <button
                key={g.id}
                type="button"
                data-tv-focusable="true"
                aria-label={g.title}
                title={g.title}
                onClick={() => {
                  triggerHaptic('light');
                  playKidsSound('tap', soundEnabled, true);
                  setActiveGame(g.id);
                }}
                className={`h-9 w-9 sm:w-auto sm:px-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeGame === g.id
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'bg-[#182352] text-sky-200 hover:bg-[#243272]'
                }`}
              >
                <KidsAnimatedCategoryIcon name={g.icon} size={16} />
                <span className="hidden lg:inline">{g.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4 ILLUSTRATED ARCADE CARDS */}
      {!activeGame && (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-0.5 pb-4 flex flex-col justify-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 landscape:grid-cols-2 md:landscape:grid-cols-4 gap-3 sm:gap-4 w-full lg:max-h-[430px] my-auto">
            {GAME_CARDS.map((game) => (
              <button
                key={game.id}
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('medium');
                  playKidsSound('tap', soundEnabled, true);
                  setActiveGame(game.id);
                }}
                className={`group relative rounded-3xl overflow-hidden border-2 ${game.borderTone} bg-[#101836] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] focus-visible:scale-105 focus-visible:ring-4 focus-visible:ring-amber-300 min-h-[138px] sm:min-h-[240px] landscape:min-h-[128px] outline-none`}
              >
                <img
                  src={game.coverImg}
                  alt={game.title}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/50 to-transparent" />

                <div className="relative z-10 p-3.5 sm:p-4 flex items-end justify-between gap-3 w-full">
                  <div className="min-w-0">
                    <div className={`text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider ${game.accentText}`}>
                      {game.kicker}
                    </div>
                    <h3 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                      {game.title}
                    </h3>
                    <p className="text-xs text-sky-100/80 line-clamp-1 sm:line-clamp-2 mt-0.5">
                      {game.desc}
                    </p>
                  </div>

                  <span
                    className={`w-10 h-10 rounded-full ${game.playBtnBg} flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform`}
                  >
                    <Play className="w-5 h-5 fill-current ms-0.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE GAME CANVAS / BOARD */}
      {activeGame === 'stars' && (
        <KidsStarCatcherGame
          kidsLang={kidsLang}
          ageGroup={ageGroup}
          unlockedRewards={unlockedRewards}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeGame === 'math' && (
        <KidsMathBubblesGame
          kidsLang={kidsLang}
          ageGroup={ageGroup}
          unlockedRewards={unlockedRewards}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeGame === 'memory' && (
        <KidsMemoryGame
          kidsLang={kidsLang}
          ageGroup={ageGroup}
          profileId={profileId}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeGame === 'simon' && (
        <KidsSimonGame
          kidsLang={kidsLang}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
    </div>
  );
};
