import React from 'react';
import { CheckCircle2, Lock, MapPin } from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import type { KidsLanguageMeta } from './kidsData';
import { KIDS_LEARNING_ISLANDS, type KidsIslandUnit } from './kidsCurriculumData';
import { KidsVocabSvg } from './KidsSvgArt';

interface KidsIslandsGridProps {
  kidsLang: KidsLanguageCode;
  targetMeta: KidsLanguageMeta;
  completedNodes: Record<string, boolean>;
  onStartIslandNode: (island: KidsIslandUnit, node: KidsIslandUnit['nodes'][number]) => void;
}

export const KidsIslandsGrid: React.FC<KidsIslandsGridProps> = ({
  kidsLang,
  targetMeta,
  completedNodes,
  onStartIslandNode,
}) => {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {KIDS_LEARNING_ISLANDS.map((island, islIdx) => {
          const title = island.titleByLang[kidsLang] || island.titleByLang.es;
          const prevIsland = islIdx > 0 ? KIDS_LEARNING_ISLANDS[islIdx - 1] : null;
          const unlocked =
            islIdx === 0 ||
            Boolean(completedNodes[prevIsland?.nodes[0]?.id || '']) ||
            Boolean(completedNodes[island.nodes[0].id]);
          const doneInIsland = island.nodes.filter((n) => completedNodes[n.id]).length;

          return (
            <div
              key={island.id}
              className={`rounded-3xl border-2 p-3.5 flex flex-col gap-3 transition-all ${
                unlocked
                  ? 'bg-gradient-to-br from-[#192350] to-[#101736] border-white/15 shadow-xl'
                  : 'bg-[#0F152F]/70 border-white/5 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-white/20"
                    style={{ backgroundColor: `${island.accentHex}28` }}
                  >
                    <KidsVocabSvg iconId={island.iconId} size={32} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-black text-sm sm:text-base text-white truncate">
                      {title}
                    </h3>
                    <p className="text-[11px] font-bold text-sky-200/75 tabular-nums">
                      {doneInIsland}/{island.nodes.length} pasos · {targetMeta.nativeLabel}
                    </p>
                  </div>
                </div>

                {!unlocked && <Lock className="w-4 h-4 text-zinc-400 shrink-0" />}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {island.nodes.map((node, nIdx) => {
                  const isDone = Boolean(completedNodes[node.id]);
                  const prevNodeDone =
                    nIdx === 0 ? unlocked : Boolean(completedNodes[island.nodes[nIdx - 1].id]);
                  const nodeClickable = unlocked && (nIdx === 0 || prevNodeDone || isDone);

                  return (
                    <button
                      key={node.id}
                      type="button"
                      disabled={!nodeClickable}
                      data-tv-focusable="true"
                      onClick={() => onStartIslandNode(island, node)}
                      className={`p-2.5 rounded-2xl border-2 border-b-4 text-start flex items-center justify-between gap-2 transition-all ${
                        isDone
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100 cursor-pointer'
                          : nodeClickable
                          ? 'bg-[#22306B] hover:bg-[#2C3E8A] border-amber-400/50 text-white cursor-pointer'
                          : 'bg-[#0B1026] border-white/5 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase text-amber-300">
                          +{node.rewardStars} est.
                        </div>
                        <div className="text-xs font-extrabold truncate">{node.labelEs}</div>
                      </div>
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                      ) : (
                        <MapPin className="w-4 h-4 text-amber-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
