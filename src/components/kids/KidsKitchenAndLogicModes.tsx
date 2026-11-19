import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Delete,
  Play,
  RefreshCw,
  Star,
  Trash2,
  Trophy,
  Utensils,
  Volume2,
} from 'lucide-react';
import type { KidsAgeGroup } from '../../types';
import type { KidsMascotId } from './kidsData';
import type { KitchenOrder, LogicDir, LogicLevel } from './kidsMemoryHelpers';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsAnimatedMascotSvg, KidsVocabSvg } from './KidsSvgArt';

export interface KitchenFoodDisplayItem {
  id: string;
  iconId: string;
  word: string;
  esWord: string;
}

interface KidsKitchenModeProps {
  activeLangNativeLabel: string;
  ageGroup: KidsAgeGroup;
  kitchenOrder: KitchenOrder;
  kitchenFoods: KitchenFoodDisplayItem[];
  trayIds: string[];
  kitchenFeedback: 'idle' | 'ok' | 'retry';
  onSpeakOrder: (order: KitchenOrder) => void;
  onAddIngredient: (id: string, word: string) => void;
  onServeKitchen: () => void;
}

export const KidsKitchenMode: React.FC<KidsKitchenModeProps> = ({
  activeLangNativeLabel,
  ageGroup,
  kitchenOrder,
  kitchenFoods,
  trayIds,
  kitchenFeedback,
  onSpeakOrder,
  onAddIngredient,
  onServeKitchen,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto no-scrollbar p-1">
      {/* Customer Ticket */}
      <div className="rounded-2xl bg-[#0F152B] border border-pink-400/25 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-pink-500/15 border border-pink-400/30 flex items-center justify-center shrink-0">
            <KidsVocabSvg iconId={kitchenOrder.customer.id} size={44} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-pink-300">
              Pedido en {activeLangNativeLabel}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {kitchenOrder.requiredIds.map((rid) => {
                const f = kitchenFoods.find((x) => x.id === rid);
                return (
                  <span
                    key={rid}
                    className="px-2.5 py-1 rounded-xl bg-amber-400/15 border border-amber-300/40 text-amber-200 font-display font-black text-sm"
                  >
                    {f?.word}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => onSpeakOrder(kitchenOrder)}
          className="h-10 px-4 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-black text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Volume2 className="w-4 h-4" />
          <span>Escuchar pedido</span>
        </button>
      </div>

      {/* Pantry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
        {kitchenFoods.map((food) => {
          const selected = trayIds.includes(food.id);
          return (
            <button
              key={food.id}
              type="button"
              data-tv-focusable="true"
              onClick={() => onAddIngredient(food.id, food.word)}
              className={`p-3 rounded-2xl border-2 border-b-4 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selected
                  ? 'bg-emerald-500/25 border-emerald-400 text-white scale-[1.03] shadow-lg'
                  : 'bg-[#19234A] hover:bg-[#223066] border-[#2E3E78] text-sky-100'
              }`}
            >
              <KidsVocabSvg iconId={food.iconId} size={46} />
              <span className="font-display font-black text-sm text-white leading-tight text-center">
                {food.word}
              </span>
              {ageGroup === '3-5' && (
                <span className="text-[10px] font-bold text-sky-300/80">{food.esWord}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Serving Tray & Action */}
      <div className="mt-auto rounded-2xl bg-[#0F152B] border border-white/10 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-black text-sky-200">Tu bandeja:</span>
          {trayIds.length === 0 ? (
            <span className="text-xs font-bold text-slate-400">
              Toca los ingredientes del pedido arriba
            </span>
          ) : (
            trayIds.map((tid) => {
              const f = kitchenFoods.find((x) => x.id === tid);
              return (
                <span
                  key={tid}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 text-xs font-black text-white"
                >
                  <KidsVocabSvg iconId={f?.iconId || 'apple'} size={20} />
                  <span>{f?.word}</span>
                </span>
              );
            })
          )}
          {kitchenFeedback === 'retry' && (
            <span className="text-xs font-black text-rose-300">
              Revisa los ingredientes del ticket e inténtalo otra vez
            </span>
          )}
          {kitchenFeedback === 'ok' && (
            <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>Pedido perfecto. +3 estrellas</span>
            </span>
          )}
        </div>

        <KidsSquishButton
          onClick={onServeKitchen}
          disabled={trayIds.length === 0 || kitchenFeedback === 'ok'}
          className="px-5 rounded-xl bg-gradient-to-b from-emerald-300 to-emerald-500 border-b-4 border-emerald-700 text-slate-950 font-black text-sm flex items-center gap-2 disabled:opacity-45"
        >
          <Utensils className="w-4 h-4" />
          <span>Servir Plato</span>
        </KidsSquishButton>
      </div>
    </div>
  );
};

interface KidsLogicBridgeModeProps {
  logicLevel: LogicLevel;
  program: LogicDir[];
  setProgram: React.Dispatch<React.SetStateAction<LogicDir[]>>;
  playerPos: { x: number; y: number };
  setPlayerPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isRunningLogic: boolean;
  logicStatus: 'idle' | 'won' | 'bumped' | 'short';
  setLogicStatus: React.Dispatch<React.SetStateAction<'idle' | 'won' | 'bumped' | 'short'>>;
  collectedBonus: boolean;
  activeMascotId: KidsMascotId;
  onNewPuzzle: () => void;
  onRunProgram: () => void;
}

const renderDirArrow = (d: LogicDir, cls = 'w-4 h-4') => {
  if (d === 'up') return <ArrowUp className={cls} />;
  if (d === 'right') return <ArrowRight className={cls} />;
  if (d === 'down') return <ArrowDown className={cls} />;
  return <ArrowLeft className={cls} />;
};

export const KidsLogicBridgeMode: React.FC<KidsLogicBridgeModeProps> = ({
  logicLevel,
  program,
  setProgram,
  playerPos,
  setPlayerPos,
  isRunningLogic,
  logicStatus,
  setLogicStatus,
  collectedBonus,
  activeMascotId,
  onNewPuzzle,
  onRunProgram,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-y-auto no-scrollbar p-1">
      {/* Interactive Tile Board */}
      <div className="flex-1 rounded-2xl bg-[#0B1126] border border-cyan-400/25 p-3 flex flex-col items-center justify-center gap-2">
        <div className="w-full flex items-center justify-between text-xs font-black">
          <span className="text-cyan-300">Programa los pasos para llegar al cofre</span>
          <button
            type="button"
            data-tv-focusable="true"
            onClick={onNewPuzzle}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Nuevo Mapa</span>
          </button>
        </div>

        <div
          className="grid gap-1.5 sm:gap-2 w-full max-w-[360px]"
          style={{ gridTemplateColumns: `repeat(${logicLevel.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: logicLevel.rows * logicLevel.cols }).map((_, flatIdx) => {
            const x = flatIdx % logicLevel.cols;
            const y = Math.floor(flatIdx / logicLevel.cols);
            const isPlayer = playerPos.x === x && playerPos.y === y;
            const isGoal = logicLevel.goal.x === x && logicLevel.goal.y === y;
            const isRock = logicLevel.rocks.some((r) => r.x === x && r.y === y);
            const isBonus =
              !collectedBonus &&
              logicLevel.bonusStar &&
              logicLevel.bonusStar.x === x &&
              logicLevel.bonusStar.y === y;

            return (
              <div
                key={`${x}-${y}`}
                className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${
                  isPlayer
                    ? 'bg-amber-400/25 border-amber-300 scale-105'
                    : isGoal
                    ? 'bg-emerald-500/25 border-emerald-400'
                    : isRock
                    ? 'bg-slate-800 border-slate-700'
                    : 'bg-[#172149] border-[#26356F]'
                }`}
              >
                {isPlayer ? (
                  <KidsAnimatedMascotSvg id={activeMascotId} size={36} />
                ) : isGoal ? (
                  <Trophy className="w-6 h-6 text-emerald-300" />
                ) : isRock ? (
                  <KidsVocabSvg iconId="mountain" size={32} />
                ) : isBonus ? (
                  <Star className="w-5 h-5 fill-amber-300 text-amber-300" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Direction Command Queue & Pad */}
      <div className="lg:w-72 shrink-0 rounded-2xl bg-[#0F152B] border border-white/10 p-3 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between text-xs font-black text-sky-200 mb-2">
            <span>Secuencia ({program.length}/10)</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isRunningLogic || program.length === 0}
                onClick={() => setProgram((p) => p.slice(0, -1))}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 cursor-pointer"
                aria-label="Borrar último paso"
              >
                <Delete className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={isRunningLogic || program.length === 0}
                onClick={() => {
                  setProgram([]);
                  setPlayerPos(logicLevel.start);
                  setLogicStatus('idle');
                }}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 cursor-pointer"
                aria-label="Limpiar ruta"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-[60px] rounded-xl bg-[#0A0F20] border border-white/10 p-2 flex flex-wrap gap-1.5 content-start">
            {program.length === 0 ? (
              <span className="text-[11px] font-bold text-slate-400">
                Pulsa las flechas abajo para crear el camino
              </span>
            ) : (
              program.map((step, i) => (
                <span
                  key={i}
                  className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 flex items-center justify-center"
                >
                  {renderDirArrow(step)}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Arrow Controls */}
        <div className="grid grid-cols-3 gap-1.5 max-w-[190px] mx-auto w-full">
          <div />
          <button
            type="button"
            data-tv-focusable="true"
            disabled={isRunningLogic || program.length >= 10}
            onClick={() => setProgram((p) => [...p, 'up'])}
            className="h-11 rounded-xl bg-[#1C285B] hover:bg-[#283982] border-b-4 border-[#0E1535] text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
            aria-label="Arriba"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <div />
          <button
            type="button"
            data-tv-focusable="true"
            disabled={isRunningLogic || program.length >= 10}
            onClick={() => setProgram((p) => [...p, 'left'])}
            className="h-11 rounded-xl bg-[#1C285B] hover:bg-[#283982] border-b-4 border-[#0E1535] text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
            aria-label="Izquierda"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            data-tv-focusable="true"
            disabled={isRunningLogic || program.length >= 10}
            onClick={() => setProgram((p) => [...p, 'down'])}
            className="h-11 rounded-xl bg-[#1C285B] hover:bg-[#283982] border-b-4 border-[#0E1535] text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
            aria-label="Abajo"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <button
            type="button"
            data-tv-focusable="true"
            disabled={isRunningLogic || program.length >= 10}
            onClick={() => setProgram((p) => [...p, 'right'])}
            className="h-11 rounded-xl bg-[#1C285B] hover:bg-[#283982] border-b-4 border-[#0E1535] text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
            aria-label="Derecha"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {logicStatus === 'won' && (
          <div className="text-center text-xs font-black text-emerald-300">
            Ruta completada. +{collectedBonus ? 5 : 4} estrellas
          </div>
        )}
        {logicStatus === 'bumped' && (
          <div className="text-center text-xs font-black text-rose-300">
            Obstáculo en el camino. Ajusta un paso
          </div>
        )}
        {logicStatus === 'short' && (
          <div className="text-center text-xs font-black text-amber-300">
            Faltaron pasos hasta el cofre
          </div>
        )}

        <KidsSquishButton
          onClick={logicStatus === 'won' ? onNewPuzzle : onRunProgram}
          disabled={isRunningLogic || (logicStatus !== 'won' && program.length === 0)}
          className="w-full rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-500 border-b-4 border-cyan-700 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-45"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{logicStatus === 'won' ? 'Siguiente Mapa' : 'Ejecutar Ruta'}</span>
        </KidsSquishButton>
      </div>
    </div>
  );
};
