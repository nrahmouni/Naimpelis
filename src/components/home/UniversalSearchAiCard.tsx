import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Play, Sparkles } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import type { AiSearchJobState } from './homeSearchTypes';

interface UniversalSearchAiCardProps {
  lang: AppLanguage;
  cleanQuery: string;
  aiJob: AiSearchJobState;
  onTriggerAiSearch: (query: string) => void;
  onSelectFoundItem: (item: CatalogMovie) => void;
}

export const UniversalSearchAiCard: React.FC<UniversalSearchAiCardProps> = ({
  lang,
  cleanQuery,
  aiJob,
  onTriggerAiSearch,
  onSelectFoundItem,
}) => (
  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#9146FF]/20 via-[#6D28D9]/15 to-[#161824] border border-[#9146FF]/40 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#D8B4FE] shrink-0" />
        <span className="text-xs font-bold text-white">
          {pickLang(lang, {
            es: 'Búsqueda Inteligente con IA en la Web',
            ca: 'Cerca Intel·ligent amb IA a la Web',
            en: 'Smart AI Web Search',
          })}
        </span>
      </div>

      {aiJob.status === 'idle' && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onTriggerAiSearch(cleanQuery);
          }}
          className="min-h-[34px] px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1 cursor-pointer shadow-md shadow-[#9146FF]/30 active:scale-95 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {pickLang(lang, {
              es: 'Buscar con IA',
              ca: 'Cercar amb IA',
              en: 'Search with AI',
            })}
          </span>
        </button>
      )}
    </div>

    {aiJob.status !== 'idle' && (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-zinc-200">
          {aiJob.status === 'searching' || aiJob.status === 'verifying' ? (
            <Loader2 className="w-4 h-4 text-[#9146FF] animate-spin shrink-0" />
          ) : aiJob.status === 'found' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="font-medium">{aiJob.progressLabel}</span>
        </div>

        {aiJob.status === 'found' && aiJob.item && (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/40 border border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <PosterImage
                src={aiJob.item.poster}
                alt={aiJob.item.title}
                aspect="poster"
                className="w-11 h-16 rounded-lg overflow-hidden shrink-0"
                fallbackTitle={aiJob.item.title}
              />
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-bold text-white truncate">{aiJob.item.title}</p>
                <p className="text-[11px] text-zinc-400">
                  {aiJob.item.year || 'HD'} · ★ {aiJob.item.rating || '8.0'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                if (aiJob.item) onSelectFoundItem(aiJob.item);
              }}
              className="min-h-10 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md active:scale-95 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {pickLang(lang, {
                  es: 'Reproducir',
                  ca: 'Reproduir',
                  en: 'Play',
                })}
              </span>
            </button>
          </div>
        )}
      </div>
    )}
  </div>
);
