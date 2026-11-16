import type { AppLanguage } from '../types';
import { pickLang } from './i18n';

export interface RoomShareMessageParams {
  lang: AppLanguage;
  roomName: string;
  inviteUrl: string;
  userName?: string;
  activeMediaTitle?: string;
  activeMediaIsLive?: boolean;
  activeMediaPoster?: string;
  activeMediaChannelLogo?: string;
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

/**
 * Generates rich localized invitation copy for WhatsApp, native share sheet,
 * and social channels, distinguishing between:
 * 1) Partidazo / Football match (Home vs Away, Competition, Score)
 * 2) Live TV Channel (Dial, Network)
 * 3) VOD Movie / Series (Title, Year, Episode)
 */
export function buildLocalizedInviteMessage({
  lang,
  roomName,
  activeMediaTitle,
  activeMediaIsLive,
  activeSportsMatch,
  activeMovie,
  activeChannel,
}: Omit<RoomShareMessageParams, 'inviteUrl'>): string {
  // 1. Partidazo / Match in progress
  if (activeSportsMatch && activeSportsMatch.homeTeam && activeSportsMatch.awayTeam) {
    const comp = activeSportsMatch.competition ? ` (${activeSportsMatch.competition})` : '';
    const score = activeSportsMatch.score ? ` · [${activeSportsMatch.score}]` : '';
    return pickLang(lang, {
      es: `⚽ ¡Viendo el partidazo «${activeSportsMatch.homeTeam} vs ${activeSportsMatch.awayTeam}»${comp}${score} en ${roomName} (RiffanTV)! Entra a la sala a vivirlo conmigo:`,
      ca: `⚽ Veient el partidàs «${activeSportsMatch.homeTeam} vs ${activeSportsMatch.awayTeam}»${comp}${score} a ${roomName} (RiffanTV)! Entra a la sala a viure'l amb mi:`,
      en: `⚽ Watching the big match "${activeSportsMatch.homeTeam} vs ${activeSportsMatch.awayTeam}"${comp}${score} in ${roomName} (RiffanTV)! Join the room to watch with me:`,
    });
  }

  // 2. Live TV Channel
  const cleanTitle = (activeChannel?.name || activeMediaTitle || '').trim();
  if (cleanTitle && (activeMediaIsLive || activeChannel)) {
    const dialInfo = activeChannel?.dial ? ` (Dial ${activeChannel.dial})` : '';
    return pickLang(lang, {
      es: `📺 ¡Estoy viendo el canal en directo «${cleanTitle}»${dialInfo} en ${roomName} (RiffanTV)! Únete aquí:`,
      ca: `📺 Estic veient el canal en directe «${cleanTitle}»${dialInfo} a ${roomName} (RiffanTV)! Uneix-te aquí:`,
      en: `📺 I'm watching the live channel "${cleanTitle}"${dialInfo} in ${roomName} (RiffanTV)! Join here:`,
    });
  }

  // 3. Movie or Series
  if (cleanTitle || activeMovie?.title) {
    const title = activeMovie?.title || cleanTitle;
    const year = activeMovie?.year ? ` (${activeMovie.year})` : '';
    const epStr =
      activeMovie?.season && activeMovie?.episode
        ? ` [T${activeMovie.season}·E${activeMovie.episode}]`
        : '';
    return pickLang(lang, {
      es: `🎬 ¡Te invito a ver «${title}»${year}${epStr} conmigo en ${roomName} (RiffanTV)! Entra aquí:`,
      ca: `🎬 Et convido a veure «${title}»${year}${epStr} amb mi a ${roomName} (RiffanTV)! Entra aquí:`,
      en: `🎬 Come watch "${title}"${year}${epStr} with me in ${roomName} (RiffanTV)! Join here:`,
    });
  }

  // 4. Default room invite
  return pickLang(lang, {
    es: `🍿 Únete a mi sala «${roomName}» en RiffanTV para ver cine y directo juntos:`,
    ca: `🍿 Uneix-te a la meva sala «${roomName}» a RiffanTV per veure cinema i directe junts:`,
    en: `🍿 Join my room "${roomName}" on RiffanTV to watch movies & live TV together:`,
  });
}

export function buildWhatsAppShareUrl(params: RoomShareMessageParams): string {
  const message = buildLocalizedInviteMessage(params);
  const fullText = `${message}\n${params.inviteUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(fullText)}`;
}
