import React from 'react';
import { Film, Tv, Users, Volume2, VolumeX, X, Youtube } from 'lucide-react';
import type { AppLanguage, CatalogMovie, MediaRichDetails } from '../../types';
import type { MovieAudioLangPreference } from '../MediaDetailsModal';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { PosterImage } from '../ui/PosterImage';
import type { FlagCode } from '../ui/LanguageBadge';

export const AUDIO_LANGUAGE_OPTIONS: {
  code: MovieAudioLangPreference;
  flagCode: FlagCode;
  labelEs: string;
  labelCa: string;
  labelEn: string;
  subEs: string;
  subCa: string;
  subEn: string;
}[] = [
  {
    code: 'ES',
    flagCode: 'es',
    labelEs: 'ES',
    labelCa: 'ES',
    labelEn: 'ES',
    subEs: 'Castellano HD',
    subCa: 'Castellà HD',
    subEn: 'Castilian HD',
  },
  {
    code: 'LAT',
    flagCode: 'lat',
    labelEs: 'LAT',
    labelCa: 'LAT',
    labelEn: 'LAT',
    subEs: 'Latino HD',
    subCa: 'Llatí HD',
    subEn: 'LatAm HD',
  },
  {
    code: 'VOSE',
    flagCode: 'vose',
    labelEs: 'VOSE',
    labelCa: 'VOSE',
    labelEn: 'VOSE',
    subEs: 'Subtitulado ES',
    subCa: 'Subtitulat',
    subEn: 'Subtitled',
  },
  {
    code: 'EN',
    flagCode: 'en',
    labelEs: 'EN',
    labelCa: 'EN',
    labelEn: 'EN',
    subEs: 'Original HD',
    subCa: 'Original HD',
    subEn: 'Original HD',
  },
];

interface MediaDetailsHeroProps {
  lang: AppLanguage;
  title: string;
  isSeries: boolean;
  backdrop?: string;
  details: MediaRichDetails | null;
  playTrailer: boolean;
  trailerMuted: boolean;
  trailerIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  unmuteAndPlayTrailer: () => void;
  onToggleTrailerMute: () => void;
  setPlayTrailer: React.Dispatch<React.SetStateAction<boolean>>;
  setTrailerMuted: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
}

export const MediaDetailsHero: React.FC<MediaDetailsHeroProps> = ({
  lang,
  title,
  isSeries,
  backdrop,
  details,
  playTrailer,
  trailerMuted,
  trailerIframeRef,
  unmuteAndPlayTrailer,
  onToggleTrailerMute,
  setPlayTrailer,
  setTrailerMuted,
  onClose,
}) => (
  <div className="relative w-full aspect-video max-h-[36dvh] sm:max-h-[380px] bg-black shrink-0 overflow-hidden">
    {playTrailer && details?.trailerKey ? (
      <iframe
        ref={trailerIframeRef}
        title={`${title} Trailer`}
        src={`https://www.youtube.com/embed/${details.trailerKey}?enablejsapi=1&autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(
          typeof window !== 'undefined' ? window.location.origin : ''
        )}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={() => {
          unmuteAndPlayTrailer();
          setTimeout(unmuteAndPlayTrailer, 350);
          setTimeout(unmuteAndPlayTrailer, 950);
        }}
        className="w-full h-full border-0"
      />
    ) : backdrop ? (
      <>
        <PosterImage
          src={backdrop}
          alt={title}
          aspect="none"
          priority
          className="w-full h-full"
          imgClassName="object-cover"
          fallbackTitle={title}
          fallbackIcon={
            isSeries ? <Tv className="w-6 h-6 text-zinc-500" /> : <Film className="w-6 h-6 text-zinc-500" />
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-[#141418]/35 to-black/30 pointer-events-none" />
        {details?.trailerKey && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setTrailerMuted(false);
              setPlayTrailer(true);
            }}
            className="absolute left-4 bottom-4 z-20 min-h-[42px] px-4 rounded-xl bg-[#141418]/85 hover:bg-[#1C1C22] border border-white/15 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 backdrop-blur-xl shadow-xl cursor-pointer transition-all active:scale-95"
          >
            <Youtube className="w-4 h-4 text-[#BF94FF]" />
            <span>
              {pickLang(lang, {
                es: '▶ Ver Tráiler 4K',
                ca: '▶ Veure Tràiler 4K',
                en: '▶ Watch 4K Trailer',
              })}
            </span>
          </button>
        )}
      </>
    ) : (
      <div className="w-full h-full flex items-center justify-center bg-white/[0.04]">
        {isSeries ? <Tv className="w-12 h-12 text-zinc-600" /> : <Film className="w-12 h-12 text-zinc-600" />}
      </div>
    )}

    <div className="sm:hidden absolute top-2 inset-x-0 z-20 flex justify-center pointer-events-none">
      <div className="sheet-handle bg-white/40" />
    </div>

    <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
      {playTrailer && details?.trailerKey && (
        <button
          type="button"
          onClick={onToggleTrailerMute}
          className={`min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-colors ${
            trailerMuted
              ? 'bg-[#9146FF] border-[#9146FF] text-white'
              : 'bg-[#18181B]/80 hover:bg-[#18181B] border-white/20 text-white'
          }`}
          title={
            trailerMuted
              ? pickLang(lang, {
                  es: 'Activar sonido del tráiler',
                  ca: 'Activar so del tràiler',
                  en: 'Unmute trailer',
                })
              : pickLang(lang, {
                  es: 'Silenciar tráiler',
                  ca: 'Silenciar tràiler',
                  en: 'Mute trailer',
                })
          }
        >
          {trailerMuted ? (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Activar sonido', ca: 'Activar so', en: 'Unmute' })}</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 text-[#00F593]" />
              <span>{pickLang(lang, { es: 'Sonido', ca: 'So', en: 'Sound' })}</span>
            </>
          )}
        </button>
      )}
      {details?.trailerKey && (
        <button
          type="button"
          onClick={() => {
            setPlayTrailer((v) => {
              const next = !v;
              if (next) setTrailerMuted(false);
              return next;
            });
          }}
          className="min-h-[36px] px-3 rounded-xl bg-[#18181B]/80 hover:bg-[#18181B] border border-white/20 text-xs font-semibold text-white flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-colors"
        >
          <Youtube className="w-3.5 h-3.5 text-[#BF94FF]" />
          <span>
            {playTrailer
              ? pickLang(lang, { es: 'Ocultar tráiler', ca: 'Amagar tràiler', en: 'Hide trailer' })
              : pickLang(lang, { es: 'Tráiler 4K', ca: 'Tràiler 4K', en: 'Watch trailer' })}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={pickLang(lang, { es: 'Cerrar ficha', ca: 'Tancar fitxa', en: 'Close details' })}
        className="w-10 h-10 rounded-xl bg-[#141418]/80 hover:bg-[#9146FF] border border-white/20 flex items-center justify-center text-white backdrop-blur-md cursor-pointer transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

interface MediaDetailsCastAndSimilarProps {
  lang: AppLanguage;
  isSeries: boolean;
  details: MediaRichDetails | null;
  onSelectSimilar: (movie: CatalogMovie) => void;
}

export const MediaDetailsCastAndSimilar: React.FC<MediaDetailsCastAndSimilarProps> = ({
  lang,
  isSeries,
  details,
  onSelectSimilar,
}) => (
  <>
    {details?.cast && details.cast.length > 0 && (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-xs sm:text-sm text-zinc-200 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#9146FF]" />
            <span>
              {pickLang(lang, { es: 'Reparto Principal', ca: 'Repartiment Principal', en: 'Top Cast' })}
            </span>
          </h3>
          {details.directorOrCreator && (
            <span className="text-xs text-zinc-400">
              {isSeries
                ? pickLang(lang, { es: 'Creada por ', ca: 'Creada per ', en: 'Created by ' })
                : 'Dir. '}
              <strong className="text-zinc-200 font-medium">{details.directorOrCreator}</strong>
            </span>
          )}
        </div>

        <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {details.cast.map((actor) => (
            <div
              key={actor.id}
              className="w-[104px] sm:w-[116px] shrink-0 rounded-2xl bg-white/[0.04] border border-white/[0.08] p-2 flex flex-col items-center text-center gap-1.5"
            >
              {actor.photo ? (
                <img
                  src={actor.photo}
                  alt={actor.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-full object-cover border border-white/10"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/[0.07] flex items-center justify-center text-xs font-bold text-zinc-300">
                  {actor.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 w-full">
                <div className="text-[11px] font-semibold text-white truncate">{actor.name}</div>
                <div className="text-[10px] text-zinc-400 truncate">{actor.character}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {details?.similar && details.similar.length > 0 && (
      <div className="space-y-2.5">
        <h3 className="font-display font-semibold text-xs sm:text-sm text-zinc-200">
          {pickLang(lang, { es: 'Títulos Similares', ca: 'Títols Similars', en: 'More Like This' })}
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {details.similar.slice(0, 8).map((sim) => (
            <button
              key={sim.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onSelectSimilar(sim);
              }}
              className="group text-left rounded-2xl overflow-hidden bg-white/[0.04] nc-card-sheen border border-white/[0.08] hover:border-[#9146FF]/50 transition-all cursor-pointer flex flex-col"
            >
              <PosterImage
                src={sim.poster}
                alt={sim.title}
                aspect="poster"
                className="w-full"
                imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                fallbackTitle={sim.title}
              />
              <div className="p-2">
                <div className="text-[11px] font-semibold text-white truncate">{sim.title}</div>
                <div className="text-[10px] text-zinc-400 truncate">
                  {sim.year}
                  {sim.rating ? ` · ★ ${sim.rating}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    )}
  </>
);
