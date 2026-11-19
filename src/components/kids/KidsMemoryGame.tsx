import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChefHat,
  Compass,
  Flame,
  RefreshCw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
  loadLeitnerBoxes,
  updateLeitnerBox,
  type LeitnerBoxesMap,
} from './kidsData';
import { EXTENDED_VOCAB_ITEMS } from './kidsCurriculumData';
import { playKidsCardFlip, playKidsComboNote, playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsVocabSvg } from './KidsSvgArt';
import {
  buildKitchenOrder,
  buildLeitnerDeck,
  cleanSpokenWord,
  FULL_VOCAB_ENTRIES,
  generateLogicLevel,
  KITCHEN_FOOD_IDS,
  type KitchenOrder,
  type LogicDir,
  type LogicLevel,
  type MemoryArcadeMode,
  type MemoryCardItem,
} from './kidsMemoryHelpers';
import { KidsKitchenMode, KidsLogicBridgeMode } from './KidsKitchenAndLogicModes';

interface KidsMemoryGameProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  profileId: string;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}

export const KidsMemoryGame: React.FC<KidsMemoryGameProps> = ({
  kidsLang,
  ageGroup,
  profileId,
  onEarnStar,
  onMissionPlay,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const activeMascotId = useKidsStore((s) => s.getActiveProfile().mascotId);
  const recordDomainResult = useKidsStore((s) => s.recordDomainResult);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const [subMode, setSubMode] = useState<MemoryArcadeMode>('memory');
  const [practiceLang, setPracticeLang] = useState<KidsLanguageCode>(kidsLang);

  // --- Mode 1: Leitner Memory ---
  const [leitnerBoxes, setLeitnerBoxes] = useState<LeitnerBoxesMap>(() =>
    loadLeitnerBoxes(profileId)
  );
  const [deck, setDeck] = useState<MemoryCardItem[]>(() =>
    buildLeitnerDeck(kidsLang, ageGroup, loadLeitnerBoxes(profileId))
  );
  const [peeking, setPeeking] = useState(true);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [combo, setCombo] = useState(0);
  const [victory, setVictory] = useState(false);

  // --- Mode 2: World Kitchen ---
  const [kitchenOrder, setKitchenOrder] = useState<KitchenOrder>(() => buildKitchenOrder(ageGroup));
  const [trayIds, setTrayIds] = useState<string[]>([]);
  const [kitchenFeedback, setKitchenFeedback] = useState<'idle' | 'ok' | 'retry'>('idle');
  const [kitchenServedCount, setKitchenServedCount] = useState(0);

  // --- Mode 3: Logic Bridge ---
  const [logicLevel, setLogicLevel] = useState<LogicLevel>(() => generateLogicLevel(ageGroup));
  const [program, setProgram] = useState<LogicDir[]>([]);
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number }>(logicLevel.start);
  const [isRunningLogic, setIsRunningLogic] = useState(false);
  const [logicStatus, setLogicStatus] = useState<'idle' | 'won' | 'bumped' | 'short'>('idle');
  const [collectedBonus, setCollectedBonus] = useState(false);

  const [confettiActive, setConfettiActive] = useState(false);
  const logicTimerRef = useRef<number[]>([]);

  const clearLogicTimers = () => {
    logicTimerRef.current.forEach((id) => window.clearTimeout(id));
    logicTimerRef.current = [];
  };

  useEffect(() => () => clearLogicTimers(), []);

  const resetDeck = useCallback(
    (langOverride?: KidsLanguageCode) => {
      const target = langOverride || practiceLang;
      const boxes = loadLeitnerBoxes(profileId);
      setLeitnerBoxes(boxes);
      setDeck(buildLeitnerDeck(target, ageGroup, boxes));
      setSelectedUids([]);
      setMoves(0);
      setCombo(0);
      setVictory(false);
      setConfettiActive(false);
      setPeeking(true);
    },
    [ageGroup, practiceLang, profileId]
  );

  useEffect(() => {
    if (!peeking) return;
    const timer = window.setTimeout(() => setPeeking(false), 1450);
    return () => window.clearTimeout(timer);
  }, [peeking]);

  useEffect(() => {
    resetDeck(practiceLang);
  }, [ageGroup, practiceLang, profileId, resetDeck]);

  const speakRate = ux.tortoiseSpeech ? 0.72 : undefined;

  const kitchenFoods = useMemo(
    () =>
      KITCHEN_FOOD_IDS.map((id) => {
        const entry = EXTENDED_VOCAB_ITEMS.find((v) => v.id === id) || EXTENDED_VOCAB_ITEMS[0];
        const tr = entry.translations[practiceLang] || entry.translations.es;
        return {
          id: entry.id,
          iconId: entry.iconId,
          word: cleanSpokenWord(tr.word),
          esWord: entry.translations.es.word,
        };
      }),
    [practiceLang]
  );

  const speakOrderPrompt = useCallback(
    (order: KitchenOrder) => {
      if (!ux.soundEnabled) return;
      const words = order.requiredIds
        .map((id) => {
          const item = EXTENDED_VOCAB_ITEMS.find((v) => v.id === id);
          return cleanSpokenWord((item?.translations[practiceLang] || item?.translations.es)?.word || id);
        })
        .join(', ');
      void speakKidsText(words, practiceLang, { ageGroup, rate: speakRate });
    },
    [ageGroup, practiceLang, speakRate, ux.soundEnabled]
  );

  const handleCardPress = (card: MemoryCardItem) => {
    if (peeking || victory || card.flipped || card.matched || selectedUids.length >= 2) return;

    triggerHaptic('light');
    playKidsCardFlip(ux.soundEnabled);
    if (ux.soundEnabled) {
      void speakKidsText(card.spokenText, practiceLang, { ageGroup, rate: speakRate });
    }

    const updated = deck.map((c) => (c.uid === card.uid ? { ...c, flipped: true } : c));
    const nextSel = [...selectedUids, card.uid];
    setDeck(updated);
    setSelectedUids(nextSel);

    if (nextSel.length === 2) {
      setMoves((m) => m + 1);
      const [idA, idB] = nextSel;
      const first = updated.find((c) => c.uid === idA);
      const second = updated.find((c) => c.uid === idB);

      if (first && second && first.pairId === second.pairId) {
        const nextBoxes = updateLeitnerBox(leitnerBoxes, first.pairId, true, profileId);
        setLeitnerBoxes(nextBoxes);
        recordDomainResult('lang', true, first.pairId);
        const nextCombo = combo + 1;
        setCombo(nextCombo);

        window.setTimeout(() => {
          playKidsComboNote(nextCombo - 1, ux.soundEnabled);
          triggerHaptic('success');
          onMissionPlay?.();
          onEarnStar(nextCombo >= 2 ? 3 : 2, 'memory_master');

          setDeck((curr) => {
            const nextDeck = curr.map((c) =>
              c.pairId === first.pairId ? { ...c, matched: true, flipped: true } : c
            );
            if (nextDeck.every((c) => c.matched)) {
              setVictory(true);
              setConfettiActive(true);
              playKidsSound('levelUp', ux.soundEnabled, true);
              onEarnStar(3, 'memory_master');
            }
            return nextDeck;
          });
          setSelectedUids([]);
        }, 300);
      } else {
        setCombo(0);
        if (first) {
          recordDomainResult('lang', false, first.pairId);
          setLeitnerBoxes((curr) => updateLeitnerBox(curr, first.pairId, false, profileId));
        }
        window.setTimeout(() => {
          playKidsSound('error', ux.soundEnabled, false);
          setDeck((curr) =>
            curr.map((c) => (c.uid === idA || c.uid === idB ? { ...c, flipped: false } : c))
          );
          setSelectedUids([]);
        }, 720);
      }
    }
  };

  const handleAddIngredient = (id: string, word: string) => {
    if (kitchenFeedback === 'ok') return;
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, false);
    if (ux.soundEnabled) {
      void speakKidsText(word, practiceLang, { ageGroup, rate: speakRate });
    }
    setKitchenFeedback('idle');
    setTrayIds((curr) => (curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]));
  };

  const handleServeKitchen = () => {
    if (trayIds.length === 0) return;
    const reqSorted = [...kitchenOrder.requiredIds].sort().join('|');
    const traySorted = [...trayIds].sort().join('|');
    const isOk = reqSorted === traySorted;

    if (isOk) {
      triggerHaptic('success');
      playKidsSound('levelUp', ux.soundEnabled, true);
      setKitchenFeedback('ok');
      setConfettiActive(true);
      setKitchenServedCount((c) => c + 1);
      onMissionPlay?.();
      kitchenOrder.requiredIds.forEach((wid) => recordDomainResult('lang', true, wid));
      onEarnStar(3, 'tarifit_friend');

      window.setTimeout(() => {
        const nextOrder = buildKitchenOrder(ageGroup);
        setKitchenOrder(nextOrder);
        setTrayIds([]);
        setKitchenFeedback('idle');
        speakOrderPrompt(nextOrder);
      }, 1200);
    } else {
      triggerHaptic('warning');
      playKidsSound('error', ux.soundEnabled, false);
      recordDomainResult('lang', false);
      setKitchenFeedback('retry');
    }
  };

  const newLogicPuzzle = () => {
    clearLogicTimers();
    const lv = generateLogicLevel(ageGroup);
    setLogicLevel(lv);
    setProgram([]);
    setPlayerPos(lv.start);
    setIsRunningLogic(false);
    setLogicStatus('idle');
    setCollectedBonus(false);
  };

  const runLogicProgram = () => {
    if (isRunningLogic || program.length === 0) return;
    clearLogicTimers();
    setIsRunningLogic(true);
    setLogicStatus('idle');
    setPlayerPos(logicLevel.start);
    setCollectedBonus(false);

    let cx = logicLevel.start.x;
    let cy = logicLevel.start.y;
    let bonusHit = false;
    const rockSet = new Set(logicLevel.rocks.map((r) => `${r.x},${r.y}`));

    for (let idx = 0; idx < program.length; idx++) {
      const stepDir = program[idx];
      const nextX = stepDir === 'right' ? cx + 1 : stepDir === 'left' ? cx - 1 : cx;
      const nextY = stepDir === 'down' ? cy + 1 : stepDir === 'up' ? cy - 1 : cy;
      const blocked =
        nextX < 0 ||
        nextX >= logicLevel.cols ||
        nextY < 0 ||
        nextY >= logicLevel.rows ||
        rockSet.has(`${nextX},${nextY}`);

      const stepTimer = window.setTimeout(() => {
        if (blocked) {
          playKidsSound('error', ux.soundEnabled, true);
          recordDomainResult('logic', false);
          setIsRunningLogic(false);
          setLogicStatus('bumped');
          return;
        }
        playKidsSound('tap', ux.soundEnabled, false);
        cx = nextX;
        cy = nextY;
        setPlayerPos({ x: cx, y: cy });

        if (
          logicLevel.bonusStar &&
          cx === logicLevel.bonusStar.x &&
          cy === logicLevel.bonusStar.y &&
          !bonusHit
        ) {
          bonusHit = true;
          setCollectedBonus(true);
          playKidsSound('star', ux.soundEnabled, true);
        }

        if (cx === logicLevel.goal.x && cy === logicLevel.goal.y) {
          clearLogicTimers();
          setIsRunningLogic(false);
          setLogicStatus('won');
          setConfettiActive(true);
          playKidsSound('levelUp', ux.soundEnabled, true);
          recordDomainResult('logic', true);
          onMissionPlay?.();
          onEarnStar(bonusHit ? 5 : 4, 'memory_master');
          return;
        }

        if (idx === program.length - 1) {
          setIsRunningLogic(false);
          setLogicStatus('short');
        }
      }, (idx + 1) * 320);

      logicTimerRef.current.push(stepTimer);
      if (blocked) break;
      cx = nextX;
      cy = nextY;
    }
  };

  const masteredCount = Object.values(leitnerBoxes).filter((lvl) => lvl >= 3).length;
  const pairCount = deck.length / 2;
  const starRating = moves <= pairCount + 2 ? 3 : moves <= pairCount + 6 ? 2 : 1;
  const activeLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === practiceLang) || KIDS_LANGUAGES[0];

  return (
    <div
      dir={dir}
      className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-pink-400/25 p-2 sm:p-3 flex flex-col gap-2 overflow-hidden relative"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* COMPACT HUD + 3 SUB-MODES + 8-LANGUAGE PICKER */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0F152B] border border-white/10 text-xs font-black">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'memory', label: 'Memoria 60+', Icon: Sparkles },
              { id: 'kitchen', label: 'Cocina del Mundo', Icon: ChefHat },
              { id: 'logic', label: 'Puente Lógico', Icon: Compass },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                playKidsSound('tap', ux.soundEnabled, false);
                setSubMode(id);
                setConfettiActive(false);
              }}
              className={`h-8 px-2.5 rounded-lg font-black text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                subMode === id
                  ? 'bg-pink-400 text-slate-950 shadow'
                  : 'bg-[#1A244D] text-sky-100 hover:bg-[#233266]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {subMode !== 'logic' && (
            <div className="flex items-center gap-1.5">
              <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-4 h-3 shrink-0" />
              <select
                aria-label={t.chooseLanguageTitle}
                value={practiceLang}
                onChange={(e) => setPracticeLang(e.target.value as KidsLanguageCode)}
                className="h-8 px-2 rounded-lg bg-[#1A244D] border border-white/15 text-xs font-black text-white outline-none focus:border-amber-400 cursor-pointer"
              >
                {KIDS_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          {subMode === 'memory' && combo > 1 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-500/20 text-orange-300 tabular-nums">
              <Flame className="w-3.5 h-3.5 fill-orange-400" />
              x{combo}
            </span>
          )}

          {subMode === 'memory' && (
            <span className="hidden md:inline text-emerald-300 tabular-nums">
              {masteredCount}/{FULL_VOCAB_ENTRIES.length}
            </span>
          )}

          {subMode === 'kitchen' && (
            <span className="text-amber-300 tabular-nums">Pedidos: {kitchenServedCount}</span>
          )}

          {subMode === 'memory' && (
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => resetDeck()}
              className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.memoryNewDeck}</span>
            </button>
          )}
        </div>
      </div>

      {/* SUBMODE 1: MEMORIA LEITNER */}
      {subMode === 'memory' && (
        <div className="relative flex-1 min-h-0 overflow-y-auto no-scrollbar">
          <div
            className={`h-full grid gap-2 sm:gap-3 ${
              deck.length <= 6
                ? 'grid-cols-2 sm:grid-cols-3 landscape:grid-cols-3'
                : 'grid-cols-3 sm:grid-cols-4 landscape:grid-cols-6'
            }`}
          >
            {deck.map((card) => {
              const revealed = peeking || card.flipped || card.matched;
              const boxLevel = leitnerBoxes[card.pairId] || 1;
              return (
                <button
                  key={card.uid}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => handleCardPress(card)}
                  className={`min-h-[84px] sm:min-h-[110px] landscape:min-h-[72px] rounded-2xl border-2 border-b-4 p-2 flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-amber-300 ${
                    card.matched
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100 scale-[0.98]'
                      : revealed
                      ? 'bg-[#1F2C63] border-amber-300 text-white shadow-lg'
                      : 'bg-gradient-to-br from-[#1C285B] to-[#131B3E] hover:from-[#243475] border-[#32448C] text-sky-300'
                  }`}
                >
                  {revealed ? (
                    card.kind === 'art' ? (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <KidsVocabSvg iconId={card.iconId} size={44} />
                        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                          Lv.{boxLevel}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 px-1">
                        <span className="font-display font-black text-sm sm:text-base text-white text-center leading-tight">
                          {card.word}
                        </span>
                        <Volume2 className="w-3.5 h-3.5 text-sky-300" />
                      </div>
                    )
                  ) : (
                    <div className="w-11 h-11 rounded-2xl bg-amber-400/10 border border-amber-300/30 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-300" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {victory && (
            <div className="absolute inset-0 bg-[#0B1026]/92 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center gap-3 p-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
                <Trophy className="w-9 h-9 text-amber-300" />
              </div>

              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className={`w-7 h-7 ${
                      n <= starRating ? 'fill-amber-300 text-amber-300' : 'text-white/20'
                    }`}
                  />
                ))}
              </div>

              <h3 className="font-display font-black text-2xl sm:text-3xl text-amber-300">
                {t.memoryVictoryTitle}
              </h3>
              <p className="text-sm sm:text-base font-bold text-white max-w-sm">
                {t.memoryVictoryBody} ({moves} {t.memoryMovesLabel})
              </p>
              <KidsSquishButton
                onClick={() => resetDeck()}
                className="px-6 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-base"
              >
                {t.funPlayAgain}
              </KidsSquishButton>
            </div>
          )}
        </div>
      )}

      {subMode === 'kitchen' && (
        <KidsKitchenMode
          activeLangNativeLabel={activeLangMeta.nativeLabel}
          ageGroup={ageGroup}
          kitchenOrder={kitchenOrder}
          kitchenFoods={kitchenFoods}
          trayIds={trayIds}
          kitchenFeedback={kitchenFeedback}
          onSpeakOrder={speakOrderPrompt}
          onAddIngredient={handleAddIngredient}
          onServeKitchen={handleServeKitchen}
        />
      )}

      {subMode === 'logic' && (
        <KidsLogicBridgeMode
          logicLevel={logicLevel}
          program={program}
          setProgram={setProgram}
          playerPos={playerPos}
          setPlayerPos={setPlayerPos}
          isRunningLogic={isRunningLogic}
          logicStatus={logicStatus}
          setLogicStatus={setLogicStatus}
          collectedBonus={collectedBonus}
          activeMascotId={activeMascotId}
          onNewPuzzle={newLogicPuzzle}
          onRunProgram={runLogicProgram}
        />
      )}
    </div>
  );
};
