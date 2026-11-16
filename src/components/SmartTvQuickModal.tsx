import React, { useEffect, useState } from 'react';
import {
  Tv,
  Smartphone,
  Check,
  QrCode,
  ChevronDown,
  AlertCircle,
  Radio,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AppLanguage, TvRemoteCommandType } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { BottomSheet, HapticTvRemote, PrimaryButton, StandardInput } from './ui/DesignSystem';

interface SmartTvQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  roomId: string;
  hasConnectedSmartTv: boolean;
  onClaimTvCode: (fourDigitCode: string) => void | Promise<void>;
  tvClaimStatus?: { type: 'success' | 'error'; message: string } | null;
  isRoomPlaying?: boolean;
  onRemoteTogglePlay?: () => void;
  onRemoteSeekDelta?: (deltaSec: number) => void;
  onSendTvRemoteCommand?: (cmd: TvRemoteCommandType) => void;
  onSwitchThisDeviceToTvLobby?: () => void;
  onTriggerAirPlayPicker?: () => boolean;
}

export const SmartTvQuickModal: React.FC<SmartTvQuickModalProps> = ({
  isOpen,
  onClose,
  lang,
  roomId,
  hasConnectedSmartTv,
  onClaimTvCode,
  tvClaimStatus,
  isRoomPlaying = false,
  onRemoteTogglePlay,
  onRemoteSeekDelta,
  onSendTvRemoteCommand,
  onTriggerAirPlayPicker,
}) => {
  const [tvCodeInput, setTvCodeInput] = useState('');
  const [showCodePairing, setShowCodePairing] = useState(false);
  const [castFeedback, setCastFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCastFeedback(null);
      setShowCodePairing(false);
    }
  }, [isOpen]);

  const tvUrl = `${window.location.origin}/tv?room=${encodeURIComponent(roomId)}`;

  const handleCastAction = async () => {
    triggerHaptic('medium');
    setCastFeedback(null);

    if (onTriggerAirPlayPicker && onTriggerAirPlayPicker()) {
      setCastFeedback(
        pickLang(lang, {
          es: 'Selecciona tu televisor en la ventana del sistema.',
          ca: 'Selecciona el teu televisor a la finestra del sistema.',
          en: 'Select your TV from the system prompt.',
        })
      );
      return;
    }

    const nav = navigator as unknown as {
      presentation?: {
        defaultRequest?: { start?: () => Promise<void> };
      };
    };

    try {
      if (nav?.presentation?.defaultRequest?.start) {
        await nav.presentation.defaultRequest.start();
        return;
      }
    } catch {
      // Fallback below
    }

    const v = document.querySelector('video') as
      | (HTMLVideoElement & {
          remote?: { prompt?: () => Promise<void> };
        })
      | null;

    if (v?.remote?.prompt) {
      try {
        await v.remote.prompt();
        return;
      } catch {
        // Fallback below
      }
    }

    setShowCodePairing(true);
    setCastFeedback(
      pickLang(lang, {
        es: 'Usa AirPlay, Chromecast o Smart View desde el menú de tu móvil, o vincula tu TV con el código.',
        ca: 'Usa AirPlay, Chromecast o Smart View des del menú del mòbil, o vincula la TV amb el codi.',
        en: 'Use AirPlay, Chromecast, or Smart View from your phone, or pair with the 4-digit code below.',
      })
    );
  };

  const handleMapTvCommand = (
    action:
      | 'toggle_play'
      | 'seek_delta'
      | 'toggle_mute'
      | 'volume_delta'
      | 'set_volume'
      | 'force_sync'
      | 'toggle_fullscreen'
      | 'cycle_aspect'
      | 'toggle_ambilight'
      | 'cycle_subtitles'
      | 'cycle_audio',
    value?: number
  ) => {
    if (action === 'toggle_play') onRemoteTogglePlay?.();
    else if (action === 'seek_delta') onRemoteSeekDelta?.(value || 10);
    else if (action === 'toggle_mute') onSendTvRemoteCommand?.('toggle_mute');
    else if (action === 'volume_delta')
      onSendTvRemoteCommand?.((value || 0) >= 0 ? 'vol_up' : 'vol_down');
    else if (action === 'set_volume')
      onSendTvRemoteCommand?.((value || 50) >= 50 ? 'vol_up' : 'vol_down');
    else if (action === 'force_sync') onSendTvRemoteCommand?.('reload_tv');
    else if (action === 'toggle_fullscreen')
      onSendTvRemoteCommand?.('toggle_fullscreen');
    else if (action === 'cycle_aspect') onSendTvRemoteCommand?.('toggle_aspect');
    else if (action === 'toggle_ambilight')
      onSendTvRemoteCommand?.('toggle_ambilight');
    else if (action === 'cycle_subtitles')
      onSendTvRemoteCommand?.('cycle_subtitles');
    else if (action === 'cycle_audio') onSendTvRemoteCommand?.('cycle_audio');
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-md"
      title={pickLang(lang, {
        es: 'Enviar a TV',
        ca: 'Enviar a TV',
        en: 'Cast to TV',
      })}
      subtitle={pickLang(lang, {
        es: 'Envía el vídeo a tu televisor',
        ca: 'Envia el vídeo al teu televisor',
        en: 'Send video to your TV',
      })}
    >
      <div className="space-y-4 pb-2">
        {hasConnectedSmartTv && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500/12 border border-emerald-400/30 text-xs font-semibold text-emerald-200">
              <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Televisor vinculado a la sala',
                  ca: 'Televisor vinculat a la sala',
                  en: 'TV connected to room',
                })}
              </span>
            </div>

            {onSendTvRemoteCommand && (
              <HapticTvRemote
                pairedTvCode={roomId.toUpperCase()}
                lang={lang}
                isPlaying={isRoomPlaying}
                onCommand={handleMapTvCommand}
                onDisconnect={() => onSendTvRemoteCommand('reload_tv')}
              />
            )}
          </div>
        )}

        <PrimaryButton
          size="lg"
          fullWidth
          onClick={handleCastAction}
        >
          <Tv className="w-5 h-5" />
          <span>
            {pickLang(lang, {
              es: 'Enviar a TV',
              ca: 'Enviar a TV',
              en: 'Cast to TV',
            })}
          </span>
        </PrimaryButton>

        <p className="text-xs text-zinc-400 text-center">
          {pickLang(lang, {
            es: 'Compatible con Chromecast, AirPlay y Smart View',
            ca: 'Compatible amb Chromecast, AirPlay i Smart View',
            en: 'Works with Chromecast, AirPlay & Smart View',
          })}
        </p>

        {castFeedback && (
          <div className="rounded-xl bg-[#9146FF]/12 border border-[#9146FF]/35 px-3.5 py-2.5 text-xs text-[#DFCCFF] leading-relaxed">
            {castFeedback}
          </div>
        )}

        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowCodePairing((v) => !v);
            }}
            aria-expanded={showCodePairing}
            className="w-full min-h-12 px-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.04] transition-colors"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <Smartphone className="w-4 h-4 text-[#BF94FF]" />
              {pickLang(lang, {
                es: 'Vincular con código',
                ca: 'Vincular amb codi',
                en: 'Pair with code',
              })}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-zinc-400 transition-transform duration-150 ${
                showCodePairing ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showCodePairing && (
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = tvCodeInput.replace(/\D/g, '').slice(0, 4);
                  if (clean.length === 4) {
                    triggerHaptic('medium');
                    onClaimTvCode(clean);
                    setTvCodeInput('');
                  }
                }}
                className="flex gap-2"
              >
                <div className="flex-1">
                  <StandardInput
                    value={tvCodeInput}
                    onChange={(e) =>
                      setTvCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="0000"
                    inputMode="numeric"
                    maxLength={4}
                    className="text-center font-mono text-lg tracking-[0.35em] font-bold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={tvCodeInput.length !== 4}
                  className="min-h-12 px-4 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] disabled:opacity-45 text-sm font-bold text-white shrink-0 cursor-pointer transition-colors"
                >
                  {pickLang(lang, {
                    es: 'Vincular',
                    ca: 'Vincular',
                    en: 'Pair',
                  })}
                </button>
              </form>

              {tvClaimStatus && (
                <div
                  className={`rounded-xl border px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                    tvClaimStatus.type === 'success'
                      ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-200'
                      : 'bg-rose-500/12 border-rose-400/35 text-rose-200'
                  }`}
                >
                  {tvClaimStatus.type === 'success' ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{tvClaimStatus.message}</span>
                </div>
              )}

              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="p-3 rounded-2xl bg-white shadow-lg">
                  <QRCodeSVG value={tvUrl} size={136} level="M" includeMargin={false} />
                </div>
                <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-[#BF94FF]" />
                  {pickLang(lang, {
                    es: 'Escanea desde tu televisor',
                    ca: 'Escaneja des del televisor',
                    en: 'Scan from your TV',
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
};
