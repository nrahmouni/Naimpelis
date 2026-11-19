import React from 'react';
import { Check, Copy } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { RiffanArrowRightIcon } from '../ui/RiffanIcons';

interface FriendRoomLinkCardProps {
  lang: AppLanguage;
  roomId: string;
  roomName: string;
  copiedRoomId: boolean;
  copiedRoomLink: boolean;
  whatsAppShareHref: string;
  onCopyRoomCode: () => void;
  onCopyInviteLink: () => void;
}

export const FriendRoomLinkCard: React.FC<FriendRoomLinkCardProps> = ({
  lang,
  roomId,
  roomName,
  copiedRoomId,
  copiedRoomLink,
  whatsAppShareHref,
  onCopyRoomCode,
  onCopyInviteLink,
}) => (
  <div className="p-3.5 rounded-2xl bg-[#9146FF]/10 border border-[#9146FF]/30 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#D8B4FE] block">
          {pickLang(lang, {
            es: 'Invitar con enlace de sala',
            ca: 'Convidar amb enllaç de sala',
            en: 'Invite via room link',
          })}
        </span>
        <span className="text-xs font-mono text-zinc-300 truncate block">
          {roomName} · #{roomId}
        </span>
      </div>
      <button
        type="button"
        onClick={onCopyRoomCode}
        className="min-h-8 px-2.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-[11px] font-mono font-bold text-white flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
      >
        {copiedRoomId ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })}</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 text-[#BF94FF]" />
            <span>{roomId}</span>
          </>
        )}
      </button>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onCopyInviteLink}
        className={`min-h-11 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all border ${
          copiedRoomLink
            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
            : 'bg-[#9146FF] hover:bg-[#7C2AE8] border-[#9146FF] text-white'
        }`}
      >
        {copiedRoomLink ? (
          <>
            <Check className="w-4 h-4 shrink-0" />
            <span>{pickLang(lang, { es: 'Enlace copiado', ca: 'Enllaç copiat', en: 'Link copied' })}</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 shrink-0" />
            <span>{pickLang(lang, { es: 'Copiar enlace', ca: 'Copiar enllaç', en: 'Copy link' })}</span>
          </>
        )}
      </button>

      <a
        href={whatsAppShareHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => triggerHaptic('light')}
        className="min-h-11 px-3 rounded-xl bg-[#25D366] hover:bg-[#20BD5A] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
      >
        <span>WhatsApp</span>
        <RiffanArrowRightIcon size={14} tone="current" />
      </a>
    </div>
  </div>
);
