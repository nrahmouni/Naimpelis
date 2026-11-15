import type { AppLanguage } from '../types';
import { pickLang } from './i18n';

export interface RoomShareMessageParams {
  lang: AppLanguage;
  roomName: string;
  inviteUrl: string;
  userName?: string;
  activeMediaTitle?: string;
  activeMediaIsLive?: boolean;
}

/**
 * Generates localized invitation copy for WhatsApp and native system share sheet,
 * distinguishing between Live TV / sports channels and VOD movies/series.
 */
export function buildLocalizedInviteMessage({
  lang,
  roomName,
  activeMediaTitle,
  activeMediaIsLive,
}: Omit<RoomShareMessageParams, 'inviteUrl'>): string {
  const cleanTitle = (activeMediaTitle || '').trim();
  if (cleanTitle && activeMediaIsLive) {
    return pickLang(lang, {
      es: `📺 ¡Estoy viendo el canal en directo «${cleanTitle}» en ${roomName} (RiffanTV)! Únete aquí:`,
      ca: `📺 Estic veient el canal en directe «${cleanTitle}» a ${roomName} (RiffanTV)! Uneix-te aquí:`,
      en: `📺 I'm watching the live channel "${cleanTitle}" in ${roomName} (RiffanTV)! Join here:`,
    });
  }

  if (cleanTitle) {
    return pickLang(lang, {
      es: `🎬 ¡Te invito a ver «${cleanTitle}» conmigo en ${roomName} (RiffanTV)! Entra aquí:`,
      ca: `🎬 Et convido a veure «${cleanTitle}» amb mi a ${roomName} (RiffanTV)! Entra aquí:`,
      en: `🎬 Come watch "${cleanTitle}" with me in ${roomName} (RiffanTV)! Join here:`,
    });
  }

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
