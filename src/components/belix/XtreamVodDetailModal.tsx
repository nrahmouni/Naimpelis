/**
 * @module src/components/belix/XtreamVodDetailModal
 * @description Clean BottomSheet detail & instant playback modal for Xtream VOD movies.
 */
import React from 'react';
import { Film, Play, Star } from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import type { XtreamVodStreamItem } from '../../services/xtreamClientService';
import { BottomSheet, PrimaryButton } from '../ui/DesignSystem';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import {
  XtreamPosterMedia,
  buildVodTdtChannel,
  formatXtreamRating,
} from './XtreamMediaHelpers';

interface XtreamVodDetailModalProps {
  movie: XtreamVodStreamItem | null;
  categoryName?: string;
  accentColor?: string;
  lang: AppLanguage;
  onClose: () => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
}

export const XtreamVodDetailModal: React.FC<XtreamVodDetailModalProps> = ({
  movie,
  categoryName = 'Películas',
  accentColor = '#8B5CF6',
  lang,
  onClose,
  onPlayTdtChannel,
}) => {
  const handlePlay = () => {
    if (!movie) return;
    triggerHaptic('success');
    const channel = buildVodTdtChannel(movie, categoryName, accentColor);
    onClose();
    onPlayTdtChannel(channel, 0);
  };

  return (
    <BottomSheet
      isOpen={Boolean(movie)}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-lg"
      icon={<Film className="w-5 h-5" />}
      title={movie?.name || ''}
      subtitle={
        movie
          ? [movie.providerName, categoryName, movie.containerExtension?.toUpperCase()]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      footer={
        movie ? (
          <PrimaryButton onClick={handlePlay} className="w-full min-h-12">
            <Play className="w-4 h-4 fill-current" />
            <span>
              {pickLang(lang, {
                es: 'Reproducir película',
                ca: 'Reproduir pel·lícula',
                en: 'Play movie',
              })}
            </span>
          </PrimaryButton>
        ) : undefined
      }
    >
      {movie && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="w-32 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden border border-white/[0.1] bg-black/50 shrink-0 mx-auto sm:mx-0">
            <XtreamPosterMedia
              src={movie.streamIcon}
              alt={movie.name}
              variant="vod"
              accentColor={accentColor}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-300 tabular-nums">
              {formatXtreamRating(movie.rating) && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>{formatXtreamRating(movie.rating)}</span>
                </span>
              )}
              <span>{categoryName}</span>
              <span className="font-mono text-zinc-400">
                {(movie.containerExtension || 'MP4').toUpperCase()}
              </span>
            </div>

            {movie.providerName && (
              <p className="text-xs text-zinc-400">
                {pickLang(lang, {
                  es: `Fuente sincronizada: ${movie.providerName}`,
                  ca: `Font sincronitzada: ${movie.providerName}`,
                  en: `Synced source: ${movie.providerName}`,
                })}
              </p>
            )}

            <p className="text-xs text-zinc-400 leading-relaxed">
              {pickLang(lang, {
                es: 'Reproducción directa a través del proxy seguro con soporte de búfer y salto de tiempo.',
                ca: 'Reproducció directa mitjançant el proxy segur amb suport de memòria intermèdia i salt de temps.',
                en: 'Direct playback routed via secure backend proxy with range seeking support.',
              })}
            </p>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
