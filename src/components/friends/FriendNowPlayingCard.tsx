import React from 'react';
import { Film, Tv } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';

interface FriendNowPlayingCardProps {
  lang: AppLanguage;
  activeMediaTitle?: string;
  activeMediaPoster?: string;
  activeMediaIsLive?: boolean;
  activeSportsMatch?: {
    homeTeam: string;
    awayTeam: string;
    homeLogo?: string;
    awayLogo?: string;
    competition?: string;
    score?: string;
  } | null;
  activeMovie?: {
    title: string;
    year?: string;
    poster?: string;
    rating?: string;
    season?: number;
    episode?: number;
  } | null;
  activeChannel?: {
    name: string;
    dial?: number;
    logoUrl?: string;
    network?: string;
  } | null;
}

export const FriendNowPlayingCard: React.FC<FriendNowPlayingCardProps> = ({
  lang,
  activeMediaTitle,
  activeMediaPoster,
  activeMediaIsLive = false,
  activeSportsMatch,
  activeMovie,
  activeChannel,
}) => {
  if (!activeSportsMatch && !activeChannel && !activeMovie && !activeMediaTitle) {
    return null;
  }

  return (
    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#161828] to-[#0D0F1A] border border-white/[0.12] space-y-2">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        <span>
          {pickLang(lang, {
            es: 'En pantalla en esta sala',
            ca: 'En pantalla en aquesta sala',
            en: 'Now playing in room',
          })}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-[#9146FF]/25 text-[#BF94FF] text-[10px] font-bold">
          {activeSportsMatch
            ? pickLang(lang, { es: 'PARTIDAZO', ca: 'PARTIDÀS', en: 'BIG MATCH' })
            : activeMediaIsLive || activeChannel
            ? pickLang(lang, { es: 'EN DIRECTO', ca: 'EN DIRECTE', en: 'LIVE' })
            : pickLang(lang, { es: 'CINE Y SERIES', ca: 'CINEMA I SÈRIES', en: 'CINEMA' })}
        </span>
      </div>

      {activeSportsMatch && activeSportsMatch.homeTeam && activeSportsMatch.awayTeam ? (
        <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-white/10 p-1 flex items-center justify-center shrink-0">
                {activeSportsMatch.homeLogo ? (
                  <img
                    src={activeSportsMatch.homeLogo}
                    alt={activeSportsMatch.homeTeam}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-bold text-white">
                    {activeSportsMatch.homeTeam.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-white truncate">
                {activeSportsMatch.homeTeam}
              </span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-[#9146FF]/30 text-[#D8B4FE] font-mono text-xs font-bold shrink-0">
              {activeSportsMatch.score || 'VS'}
            </div>

            <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
              <span className="text-xs font-bold text-white truncate">
                {activeSportsMatch.awayTeam}
              </span>
              <div className="w-8 h-8 rounded-lg bg-white/10 p-1 flex items-center justify-center shrink-0">
                {activeSportsMatch.awayLogo ? (
                  <img
                    src={activeSportsMatch.awayLogo}
                    alt={activeSportsMatch.awayTeam}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-bold text-white">
                    {activeSportsMatch.awayTeam.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {activeSportsMatch.competition && (
            <p className="text-[11px] text-zinc-400 text-center truncate pt-0.5">
              {activeSportsMatch.competition}
            </p>
          )}
        </div>
      ) : activeChannel || (activeMediaIsLive && activeMediaTitle) ? (
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
          <div className="w-12 h-10 rounded-lg bg-black/80 border border-white/10 p-1.5 flex items-center justify-center shrink-0">
            {activeChannel?.logoUrl || activeMediaPoster ? (
              <img
                src={activeChannel?.logoUrl || activeMediaPoster}
                alt={activeChannel?.name || activeMediaTitle}
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Tv className="w-5 h-5 text-[#BF94FF]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-white truncate">
              {activeChannel?.name || activeMediaTitle}
            </h4>
            <p className="text-[11px] text-zinc-400 truncate">
              {activeChannel?.network || 'Emisión en vivo'}
              {activeChannel?.dial ? ` · Dial ${activeChannel.dial}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
          <div className="w-10 h-14 rounded-lg overflow-hidden bg-black/60 border border-white/10 shrink-0">
            {activeMovie?.poster || activeMediaPoster ? (
              <img
                src={activeMovie?.poster || activeMediaPoster}
                alt={activeMovie?.title || activeMediaTitle}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                <Film className="w-4 h-4" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-white truncate">
              {activeMovie?.title || activeMediaTitle}
            </h4>
            <p className="text-[11px] text-zinc-400 truncate">
              {activeMovie?.year ? `${activeMovie.year} ` : ''}
              {activeMovie?.season && activeMovie?.episode
                ? `· T${activeMovie.season}·E${activeMovie.episode} `
                : ''}
              {activeMovie?.rating ? `· ★ ${activeMovie.rating}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
