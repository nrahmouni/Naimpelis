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

/**
 * Reliable clipboard copy helper that works even inside iframes or WebViews
 * where navigator.clipboard.writeText may be blocked by Permissions-Policy.
 */
export async function copyTextSafely(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  } catch {
    return false;
  }
}

export async function shareOrCopyInvite(params: {
  title: string;
  text: string;
  url: string;
}): Promise<'shared' | 'copied' | 'failed'> {
  const { title, text, url } = params;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err: unknown) {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      // If user explicitly dismissed the native share sheet, don't overwrite clipboard unexpectedly,
      // unless share itself isn't permitted (NotAllowedError / TypeError).
      if (name === 'AbortError') {
        return 'shared';
      }
    }
  }
  const copied = await copyTextSafely(`${text}\n${url}`);
  return copied ? 'copied' : 'failed';
}
