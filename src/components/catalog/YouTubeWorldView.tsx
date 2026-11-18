/**
 * @module YouTubeWorldView
 * @description World 4 (YouTube) quick-topic chips and video search grid view.
 */
import React from 'react';
import { Loader2, Play, Plus, Youtube } from 'lucide-react';
import type { AppLanguage, RoomQueueItem, YouTubeSearchItem } from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { YOUTUBE_QUICK_TOPICS } from './catalogConstants';

interface YouTubeWorldViewProps {
  lang: AppLanguage;
  debouncedQuery: string;
  loading: boolean;
  results: YouTubeSearchItem[];
  onSelectTopic: (query: string) => void;
  onPlayVideo: (item: YouTubeSearchItem) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
}

export const YouTubeWorldView: React.FC<YouTubeWorldViewProps> = ({
  lang,
  debouncedQuery,
  loading,
  results,
  onSelectTopic,
  onPlayVideo,
  onAddToQueue,
}) => {
  const t = UI_COPY[lang];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {YOUTUBE_QUICK_TOPICS.map((topic) => {
          const label =
            lang === 'zh'
              ? topic.labelZh
              : lang === 'ca'
              ? topic.labelCa
              : lang === 'en'
              ? topic.labelEn
              : topic.labelEs;
          const active = debouncedQuery === topic.q;
          return (
            <button
              key={topic.q}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onSelectTopic(topic.q);
              }}
              className={`min-h-10 px-3.5 rounded-2xl text-xs font-bold border whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#9146FF] border-[#9146FF] text-white'
                  : 'bg-white/[0.05] border-white/[0.09] text-zinc-200 hover:bg-white/[0.1]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {results.map((vid) => (
            <div
              key={vid.id}
              className="rounded-2xl overflow-hidden bg-[#11131B] border border-white/[0.08] flex flex-col justify-between"
            >
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onPlayVideo(vid);
                }}
                className="text-left group cursor-pointer"
              >
                <div className="relative aspect-video bg-[#090A0F]">
                  <PosterImage
                    src={vid.thumbnail}
                    alt={vid.title}
                    aspect="video"
                    fallbackTitle={vid.title}
                    fallbackIcon={<Youtube className="w-7 h-7 text-[#BF94FF]" />}
                  />
                  {vid.duration && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                      {vid.duration}
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <h4 className="font-display font-bold text-sm text-white line-clamp-2 leading-snug">
                    {vid.title}
                  </h4>
                  <p className="text-xs text-zinc-400 truncate">
                    {vid.channel}
                    {vid.views ? ` · ${vid.views}` : ''}
                  </p>
                </div>
              </button>

              <div className="px-3 pb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onPlayVideo(vid);
                  }}
                  className="flex-1 min-h-10 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onAddToQueue({
                      kind: 'youtube',
                      title: vid.title,
                      subtitle: vid.channel,
                      poster: vid.thumbnail,
                      youtubeId: vid.videoId,
                    });
                  }}
                  aria-label={t.addToQueue}
                  className="min-w-10 min-h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
