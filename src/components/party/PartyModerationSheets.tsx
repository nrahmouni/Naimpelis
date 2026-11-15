import React from 'react';
import {
  Bookmark,
  Edit3,
  Globe,
  KeyRound,
  Link2,
  Lock,
  Play,
  Plus,
  QrCode,
  Share2,
  Shield,
  Tv,
  Unlock,
  UserCheck,
} from 'lucide-react';
import type { AppLanguage, Participant, TvRemoteCommandType } from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import {
  EffectiveViewMode,
  ViewModeSwitchButton,
} from '../MobileViewportGuard';
import {
  BottomSheet,
  HapticTvRemote,
  type HapticTvRemoteProps,
  PrimaryButton,
  SecondaryButton,
  StandardInput,
} from '../ui/DesignSystem';

interface PartyModerationSheetsProps {
  lang: AppLanguage;
  roomName: string;
  inviteUrl: string;
  isHost: boolean;
  hostOnlyControl: boolean;
  hasPin: boolean;
  isCurrentRoomPermanent: boolean;
  currentUser: Participant;
  effectiveView: EffectiveViewMode;
  onToggleViewMode: () => void;
  showUrlLoaderSheet: boolean;
  setShowUrlLoaderSheet: (open: boolean) => void;
  customUrlInput: string;
  setCustomUrlInput: (val: string) => void;
  onPlayCustomUrl: (rawUrl: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  showTvRemoteSheet: boolean;
  setShowTvRemoteSheet: (open: boolean) => void;
  hasConnectedSmartTv: boolean;
  pairedCodeLabel: string | null;
  setPairedCodeLabel: (val: string | null) => void;
  setForceShowRemote: (val: boolean) => void;
  tvClaimStatus?: { type: 'success' | 'error'; message: string } | null;
  tvCodeInput: string;
  setTvCodeInput: (val: string) => void;
  onClaimTvCode: (code: string) => void | Promise<void>;
  handleMapTvCommand: HapticTvRemoteProps['onCommand'];
  onSendTvRemoteCommand: (cmd: TvRemoteCommandType) => void;
  showQrInviteSheet: boolean;
  setShowQrInviteSheet: (open: boolean) => void;
  handleShareInvite: () => void;
  showRoomSettingsSheet: boolean;
  setShowRoomSettingsSheet: (open: boolean) => void;
  profileNameDraft: string;
  setProfileNameDraft: (val: string) => void;
  onUpdateProfile: (nextName: string, nextAvatar: string, nextColor: string) => void;
  roomNameDraft: string;
  setRoomNameDraft: (val: string) => void;
  onRenameRoom: (nextName: string) => void;
  onToggleHostLock: (nextLocked: boolean) => void;
  onTogglePermanentRoom: () => void;
  pinDraft: string;
  setPinDraft: (val: string) => void;
  onSetRoomPin: (nextPinCode: string) => void;
  onCreateNewRoom?: (customRoomName?: string) => void;
  newRoomNameDraft: string;
  setNewRoomNameDraft: (val: string) => void;
}

export const PartyModerationSheets: React.FC<PartyModerationSheetsProps> = ({
  lang,
  roomName,
  inviteUrl,
  isHost,
  hostOnlyControl,
  hasPin,
  isCurrentRoomPermanent,
  currentUser,
  effectiveView,
  onToggleViewMode,
  showUrlLoaderSheet,
  setShowUrlLoaderSheet,
  customUrlInput,
  setCustomUrlInput,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  showTvRemoteSheet,
  setShowTvRemoteSheet,
  hasConnectedSmartTv,
  pairedCodeLabel,
  setPairedCodeLabel,
  setForceShowRemote,
  tvClaimStatus,
  tvCodeInput,
  setTvCodeInput,
  onClaimTvCode,
  handleMapTvCommand,
  onSendTvRemoteCommand,
  showQrInviteSheet,
  setShowQrInviteSheet,
  handleShareInvite,
  showRoomSettingsSheet,
  setShowRoomSettingsSheet,
  profileNameDraft,
  setProfileNameDraft,
  onUpdateProfile,
  roomNameDraft,
  setRoomNameDraft,
  onRenameRoom,
  onToggleHostLock,
  onTogglePermanentRoom,
  pinDraft,
  setPinDraft,
  onSetRoomPin,
  onCreateNewRoom,
  newRoomNameDraft,
  setNewRoomNameDraft,
}) => {
  const t = UI_COPY[lang];

  return (
    <>
      <BottomSheet
        isOpen={showUrlLoaderSheet}
        onClose={() => setShowUrlLoaderSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Enlace directo o navegador web',
          ca: 'Enllaç directe o navegador web',
          en: 'Direct link or web browser',
        })}
        subtitle={pickLang(lang, {
          es: 'Reproduce archivos de vídeo directos o abre cualquier web de forma segura',
          ca: 'Reprodueix arxius de vídeo directes o obre qualsevol web de manera segura',
          en: 'Play direct video files or open any website securely',
        })}
        icon={<Link2 className="w-5 h-5" />}
      >
        <div className="space-y-3">
          <StandardInput
            type="url"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'https://ejemplo.com/stream.m3u8 o web...',
              ca: 'https://exemple.com/stream.m3u8 o web...',
              en: 'https://example.com/stream.m3u8 or website...',
            })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PrimaryButton
              disabled={!customUrlInput.trim()}
              onClick={() => {
                if (!customUrlInput.trim()) return;
                onPlayCustomUrl(customUrlInput.trim());
                setCustomUrlInput('');
                setShowUrlLoaderSheet(false);
              }}
              fullWidth
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{t.playNativeBtn}</span>
            </PrimaryButton>
            <SecondaryButton
              disabled={!customUrlInput.trim()}
              onClick={() => {
                if (!customUrlInput.trim()) return;
                onOpenCloudBrowser(customUrlInput.trim());
                setCustomUrlInput('');
                setShowUrlLoaderSheet(false);
              }}
              fullWidth
            >
              <Globe className="w-4 h-4 text-sky-400" />
              <span>{t.openCloudBtn}</span>
            </SecondaryButton>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={showTvRemoteSheet}
        onClose={() => setShowTvRemoteSheet(false)}
        lang={lang}
        title={
          hasConnectedSmartTv
            ? pickLang(lang, {
                es: 'Mando Haptic Touch TV',
                ca: 'Comandament Haptic Touch TV',
                en: 'Haptic Touch TV Remote',
              })
            : pickLang(lang, {
                es: 'Vincular Smart TV',
                ca: 'Vincular Smart TV',
                en: 'Pair Smart TV',
              })
        }
        subtitle={
          hasConnectedSmartTv
            ? pickLang(lang, {
                es: `Control táctil en tiempo real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`,
                ca: `Control tàctil en temps real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`,
                en: `Real-time touch control · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Active Room'}`,
              })
            : pickLang(lang, {
                es: 'Introduce los 4 dígitos que aparecen en /tv',
                ca: 'Introdueix els 4 dígits que apareixen a /tv',
                en: 'Enter the 4 digits shown on /tv',
              })
        }
        icon={<Tv className="w-5 h-5" />}
      >
        {tvClaimStatus && (
          <div
            className={`p-3 rounded-2xl border text-xs font-semibold ${
              tvClaimStatus.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
            }`}
          >
            {tvClaimStatus.message}
          </div>
        )}

        {hasConnectedSmartTv ? (
          <div className="space-y-2.5">
            <HapticTvRemote
              pairedTvCode={
                pairedCodeLabel ||
                pickLang(lang, { es: 'ACTIVA', ca: 'ACTIVA', en: 'ACTIVE' })
              }
              onCommand={handleMapTvCommand}
              onDisconnect={() => {
                onSendTvRemoteCommand('disconnect_tv');
                setPairedCodeLabel(null);
                setForceShowRemote(false);
              }}
            />
            <SecondaryButton
              onClick={() => {
                setForceShowRemote(false);
                setPairedCodeLabel(null);
              }}
              fullWidth
              className="!min-h-[38px] !py-1.5 text-xs"
            >
              {pickLang(lang, {
                es: 'Vincular otro televisor con código',
                ca: 'Vincular un altre televisor amb codi',
                en: 'Pair another TV with code',
              })}
            </SecondaryButton>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const clean = tvCodeInput.replace(/\D/g, '').slice(0, 4);
              if (clean.length === 4) {
                await onClaimTvCode(clean);
                setPairedCodeLabel(clean);
                setTvCodeInput('');
              }
            }}
            className="space-y-4 text-center"
          >
            <p className="text-xs text-zinc-400">
              {pickLang(lang, { es: 'Abre', ca: 'Obre', en: 'Open' })}{' '}
              <span className="text-white font-mono">{window.location.origin}/tv</span>{' '}
              {pickLang(lang, {
                es: 'en tu televisor e introduce el código de 4 dígitos:',
                ca: 'al teu televisor i introdueix el codi de 4 dígits:',
                en: 'on your TV and enter the 4-digit code:',
              })}
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={tvCodeInput}
              onChange={(e) =>
                setTvCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="0000"
              aria-label={pickLang(lang, {
                es: 'Código de 4 dígitos',
                ca: 'Codi de 4 dígits',
                en: '4-digit pairing code',
              })}
              className="w-full h-16 rounded-2xl bg-[#0E0E10] border-2 border-white/15 focus:border-[#9146FF] text-center font-mono text-3xl font-bold tracking-[0.4em] text-white focus:outline-none"
            />
            <PrimaryButton
              type="submit"
              disabled={tvCodeInput.length !== 4}
              fullWidth
              size="lg"
            >
              <Tv className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: 'Conectar Smart TV',
                  ca: 'Connectar Smart TV',
                  en: 'Connect Smart TV',
                })}
              </span>
            </PrimaryButton>
            <SecondaryButton
              type="button"
              onClick={() => setForceShowRemote(true)}
              fullWidth
            >
              {pickLang(lang, {
                es: 'Abrir Mando Haptic Touch directamente',
                ca: 'Obrir Comandament Haptic Touch directament',
                en: 'Open Haptic Touch Remote directly',
              })}
            </SecondaryButton>
          </form>
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={showQrInviteSheet}
        onClose={() => setShowQrInviteSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Código QR de Invitación',
          ca: 'Codi QR d’Invitació',
          en: 'Invitation QR Code',
        })}
        subtitle={roomName}
        icon={<QrCode className="w-5 h-5" />}
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="p-3 rounded-3xl bg-white shadow-xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                inviteUrl
              )}`}
              alt={pickLang(lang, {
                es: 'QR Sala',
                ca: 'QR Sala',
                en: 'Room QR',
              })}
              className="w-44 h-44 rounded-xl"
            />
          </div>
          <p className="text-xs text-zinc-400 text-center max-w-xs">
            {pickLang(lang, {
              es: 'Escanea con la cámara del móvil para entrar directamente a esta sala.',
              ca: 'Escaneja amb la càmera del mòbil per entrar directament a aquesta sala.',
              en: 'Scan with your phone camera to join this room directly.',
            })}
          </p>
          <PrimaryButton onClick={handleShareInvite} fullWidth>
            <Share2 className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Compartir enlace corto',
                ca: 'Compartir enllaç curt',
                en: 'Share short link',
              })}
            </span>
          </PrimaryButton>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={showRoomSettingsSheet}
        onClose={() => setShowRoomSettingsSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Ajustes y Seguridad de Sala',
          ca: 'Ajustos i Seguretat de Sala',
          en: 'Room Settings & Security',
        })}
        subtitle={pickLang(lang, {
          es: 'Personaliza tu nombre, permisos, PIN y preferencias',
          ca: 'Personalitza el teu nom, permisos, PIN i preferències',
          en: 'Customize your display name, permissions, PIN & preferences',
        })}
        icon={<Shield className="w-5 h-5" />}
      >
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#BF94FF]" />
            <span>
              {pickLang(lang, {
                es: 'Tu nombre en la sala',
                ca: 'El teu nom a la sala',
                en: 'Your name in room',
              })}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <StandardInput
              type="text"
              value={profileNameDraft}
              onChange={(e) => setProfileNameDraft(e.target.value)}
            />
            <PrimaryButton
              onClick={() => {
                if (profileNameDraft.trim()) {
                  onUpdateProfile(
                    profileNameDraft.trim(),
                    currentUser.avatar,
                    currentUser.color
                  );
                }
              }}
            >
              {pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
            </PrimaryButton>
          </div>
        </div>

        {isHost && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Nombre de la sala',
                  ca: 'Nom de la sala',
                  en: 'Room name',
                })}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <StandardInput
                type="text"
                value={roomNameDraft}
                onChange={(e) => setRoomNameDraft(e.target.value)}
              />
              <PrimaryButton
                onClick={() => {
                  if (roomNameDraft.trim()) {
                    onRenameRoom(roomNameDraft.trim());
                  }
                }}
              >
                {pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
              </PrimaryButton>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-white/[0.07]">
          <SecondaryButton
            onClick={() => onToggleHostLock(!hostOnlyControl)}
            disabled={!isHost}
            active={hostOnlyControl}
            fullWidth
            className="!justify-between"
          >
            <span className="flex items-center gap-2">
              {hostOnlyControl ? (
                <Lock className="w-4 h-4 text-amber-400" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                {pickLang(lang, {
                  es: 'Control de Reproducción (Solo Anfitrión / Co-anfitrión)',
                  ca: 'Control de Reproducció (Només Amfitrió / Co-amfitrió)',
                  en: 'Playback Control (Host / Co-host Only)',
                })}
              </span>
            </span>
            <span className="text-xs font-mono uppercase">
              {hostOnlyControl
                ? pickLang(lang, { es: 'ACTIVO', ca: 'ACTIU', en: 'ON' })
                : pickLang(lang, { es: 'PAUSA LIBRE', ca: 'PAUSA LLIURE', en: 'PLAY/PAUSE OPEN' })}
            </span>
          </SecondaryButton>
          <p className="text-[11px] text-zinc-400 px-1 leading-relaxed">
            {pickLang(lang, {
              es: 'Solo el creador de la sala es Anfitrión y puede cambiar canales o películas. Asigna Co-anfitriones en la lista de participantes para compartir ese control.',
              ca: 'Només el creador de la sala és Amfitrió i pot canviar canals o pel·lícules. Assigna Co-amfitrions a la llista de participants per compartir aquest control.',
              en: 'Only the room creator is Host and can change channels or movies. Assign Co-hosts in the participants list to share media control.',
            })}
          </p>

          <SecondaryButton
            onClick={onTogglePermanentRoom}
            disabled={!isHost}
            active={isCurrentRoomPermanent}
            fullWidth
            className="!justify-between"
          >
            <span className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Sala Permanente 24/7',
                  ca: 'Sala Permanent 24/7',
                  en: '24/7 Permanent Room',
                })}
              </span>
            </span>
            <span className="text-xs font-mono uppercase">
              {isCurrentRoomPermanent
                ? pickLang(lang, { es: 'GUARDADA', ca: 'DESADA', en: 'SAVED' })
                : pickLang(lang, { es: 'TEMPORAL', ca: 'TEMPORAL', en: 'TEMP' })}
            </span>
          </SecondaryButton>
        </div>

        {isHost && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {pickLang(lang, {
                  es: `PIN de 4 dígitos ${hasPin ? '(Activo)' : '(Opcional)'}`,
                  ca: `PIN de 4 dígits ${hasPin ? '(Actiu)' : '(Opcional)'}`,
                  en: `4-digit PIN ${hasPin ? '(Active)' : '(Optional)'}`,
                })}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <StandardInput
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinDraft}
                onChange={(e) =>
                  setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder={
                  hasPin
                    ? pickLang(lang, {
                        es: 'Cambiar PIN (4 dígitos)',
                        ca: 'Canviar PIN (4 dígits)',
                        en: 'Change PIN (4 digits)',
                      })
                    : pickLang(lang, {
                        es: 'Ej. 1234',
                        ca: 'Ex. 1234',
                        en: 'e.g. 1234',
                      })
                }
              />
              <PrimaryButton
                disabled={pinDraft.length !== 4}
                onClick={() => {
                  if (pinDraft.length === 4) {
                    onSetRoomPin(pinDraft);
                    setPinDraft('');
                  }
                }}
              >
                {pickLang(lang, { es: 'Activar', ca: 'Activar', en: 'Enable' })}
              </PrimaryButton>
              {hasPin && (
                <SecondaryButton onClick={() => onSetRoomPin('')}>
                  {pickLang(lang, { es: 'Quitar', ca: 'Treure', en: 'Remove' })}
                </SecondaryButton>
              )}
            </div>
          </div>
        )}

        {onCreateNewRoom && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Crear nueva sala',
                  ca: 'Crear nova sala',
                  en: 'Create new room',
                })}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <StandardInput
                type="text"
                value={newRoomNameDraft}
                onChange={(e) => setNewRoomNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCreateNewRoom(newRoomNameDraft.trim() || undefined);
                    setNewRoomNameDraft('');
                    setShowRoomSettingsSheet(false);
                  }
                }}
                placeholder={pickLang(lang, {
                  es: 'Nombre opcional (ej. Noche de Cine)',
                  ca: 'Nom opcional (ex. Nit de Cinema)',
                  en: 'Optional name (e.g. Movie Night)',
                })}
              />
              <PrimaryButton
                onClick={() => {
                  onCreateNewRoom(newRoomNameDraft.trim() || undefined);
                  setNewRoomNameDraft('');
                  setShowRoomSettingsSheet(false);
                }}
              >
                <Plus className="w-4 h-4" />
                <span>
                  {pickLang(lang, { es: 'Crear', ca: 'Crear', en: 'Create' })}
                </span>
              </PrimaryButton>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Formato de pantalla',
              ca: 'Format de pantalla',
              en: 'Screen layout',
            })}
          </span>
          <ViewModeSwitchButton
            effectiveView={effectiveView}
            onToggle={onToggleViewMode}
            lang={lang}
          />
        </div>
      </BottomSheet>
    </>
  );
};
