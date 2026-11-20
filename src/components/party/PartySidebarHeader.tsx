import React from 'react';
import {
  Check,
  ChevronUp,
  KeyRound,
  ListVideo,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AppLanguage, Participant, RoomQueueItem, SavedFriend } from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type { EffectiveViewMode } from '../MobileViewportGuard';
import { IconButton, SegmentedControl } from '../ui/DesignSystem';

interface PartySidebarHeaderProps {
  lang: AppLanguage;
  worldSalaMode: boolean;
  roomName: string;
  hasPin: boolean;
  participants: Participant[];
  savedFriends: SavedFriend[];
  roomQueue: RoomQueueItem[];
  activeTab: 'chat' | 'friends' | 'queue' | 'room';
  setActiveTab: (tab: 'chat' | 'friends' | 'queue' | 'room') => void;
  copiedLink: boolean;
  hideInternalTabs: boolean;
  showMenusButton: boolean;
  effectiveView: EffectiveViewMode;
  onShowMenus?: () => void;
  onOpenFloatingChatOnVideo?: () => void;
  onOpenFriendsModal?: () => void;
  onOpenInviteAction: () => void;
  onOpenSalaOptionsSheet: () => void;
}

export const PartySidebarHeader: React.FC<PartySidebarHeaderProps> = ({
  lang,
  worldSalaMode,
  roomName,
  hasPin,
  participants,
  savedFriends,
  roomQueue,
  activeTab,
  setActiveTab,
  copiedLink,
  hideInternalTabs,
  showMenusButton,
  effectiveView,
  onShowMenus,
  onOpenFloatingChatOnVideo,
  onOpenFriendsModal,
  onOpenInviteAction,
  onOpenSalaOptionsSheet,
}) => {
  const t = UI_COPY[lang];

  if (worldSalaMode) {
    return (
      <div className="border-b border-white/[0.08] shrink-0 bg-[#0D0D12]/95 backdrop-blur-xl z-20">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-display font-bold text-sm sm:text-base text-white break-words leading-snug min-w-0">
                {roomName}
              </h3>
              {hasPin && <KeyRound className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#00F593] font-semibold mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#00F593] shrink-0" />
              <span className="tabular-nums">
                {participants.length}{' '}
                {pickLang(lang, {
                  es: participants.length === 1 ? 'conectado' : 'conectados',
                  ca: participants.length === 1 ? 'connectat' : 'connectats',
                  en: participants.length === 1 ? 'connected' : 'connected',
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenInviteAction}
              className="min-h-10 px-3.5 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-[0_4px_14px_rgba(124,58,237,0.35)]"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t.copied}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>{pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}</span>
                </>
              )}
            </button>

            <IconButton
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSalaOptionsSheet();
              }}
              aria-label={pickLang(lang, {
                es: 'Más opciones de sala',
                ca: 'Més opcions de sala',
                en: 'More room options',
              })}
            >
              <MoreHorizontal className="w-5 h-5" />
            </IconButton>
          </div>
        </div>

        <div className="px-3.5 pb-2">
          <SegmentedControl
            compact
            value={activeTab === 'room' ? 'friends' : activeTab}
            onChange={(val) => setActiveTab(val)}
            options={[
              {
                id: 'chat',
                label: t.tabChat,
                icon: <MessageSquare className="w-3 h-3 shrink-0" />,
              },
              {
                id: 'friends',
                label: pickLang(lang, { es: 'Amigos', ca: 'Amics', en: 'Friends' }),
                icon: <Users className="w-3 h-3 shrink-0" />,
                badge: savedFriends.length > 0 ? savedFriends.length : participants.length,
              },
              {
                id: 'queue',
                label: pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' }),
                icon: <ListVideo className="w-3 h-3 shrink-0" />,
                badge: roomQueue.length,
              },
            ]}
          />
        </div>
      </div>
    );
  }

  if (hideInternalTabs && !showMenusButton) return null;

  return (
    <div className="px-2.5 py-1.5 border-b border-white/[0.08] flex items-center gap-2 shrink-0 bg-[#0D0D12]/95 backdrop-blur-xl z-20 overflow-hidden">
      {showMenusButton && onShowMenus && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onShowMenus();
          }}
          aria-label={pickLang(lang, {
            es: 'Mostrar menús',
            ca: 'Mostrar menús',
            en: 'Show menus',
          })}
          className="h-8 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.08] text-[11px] font-semibold text-zinc-100 flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
        >
          <ChevronUp className="w-3 h-3 text-[#A78BFA]" />
          <span>{pickLang(lang, { es: 'Menús', ca: 'Menús', en: 'Menus' })}</span>
        </button>
      )}

      {!hideInternalTabs && (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
          <SegmentedControl
            compact
            className="flex-1 min-w-0 !w-full !grid grid-cols-3"
            value={activeTab === 'friends' ? 'room' : activeTab}
            onChange={(val) => setActiveTab(val)}
            options={[
              {
                id: 'chat',
                label: t.tabChat,
                icon: <MessageSquare className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: 'queue',
                label: pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' }),
                icon: <ListVideo className="w-3.5 h-3.5 shrink-0" />,
                badge: roomQueue.length,
              },
              {
                id: 'room',
                label: t.tabRoom,
                icon: <Users className="w-3.5 h-3.5 shrink-0" />,
                badge: participants.length,
              },
            ]}
          />

          {onOpenFloatingChatOnVideo && (
            <button
              type="button"
              onClick={onOpenFloatingChatOnVideo}
              title={pickLang(lang, {
                es: 'Superponer chat flotante sobre el vídeo',
                ca: 'Superposar xat flotant sobre el vídeo',
                en: 'Overlay floating chat on video',
              })}
              aria-label={pickLang(lang, {
                es: 'Chat flotante sobre el vídeo',
                ca: 'Xat flotant sobre el vídeo',
                en: 'Floating chat over video',
              })}
              className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-[#A78BFA] cursor-pointer shrink-0 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {effectiveView === 'desktop' && (
            <button
              type="button"
              onClick={onOpenInviteAction}
              title={
                onOpenFriendsModal
                  ? pickLang(lang, {
                      es: 'Amigos e Invitación Directa',
                      ca: 'Amics i Invitació Directa',
                      en: 'Friends & Direct Invite',
                    })
                  : t.invite
              }
              aria-label={t.invite}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
                copiedLink
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-white'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-[#A78BFA]'
              }`}
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-white" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
