import React, { useState } from 'react';
import {
  Tv,
  QrCode,
  Sparkles,
  Cast,
  Airplay,
  Smartphone,
  Check,
  Copy,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { AppLanguage, TvRemoteCommandType } from '../types';
import {
  BottomSheet,
  PrimaryButton,
  SecondaryButton,
  HapticTvRemote,
} from './ui/DesignSystem';

interface SmartTvQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: AppLanguage;
  roomId: string;
  hasConnectedSmartTv: boolean;
  onClaimTvCode: (fourDigitCode: string) => void | Promise<void>;
  tvClaimStatus?: { type: 'success' | 'error'; message: string } | null;
  isRoomPlaying?: boolean;
  onRemoteTogglePlay: () => void;
  onRemoteSeekDelta: (deltaSec: number) => void;
  onSendTvRemoteCommand: (cmd: TvRemoteCommandType) => void;
  onSwitchThisDeviceToTvLobby?: () => void;
  onTriggerAirPlayPicker?: () => boolean;
}

export const SmartTvQuickModal: React.FC<SmartTvQuickModalProps> = ({
  isOpen,
  onClose,
  hasConnectedSmartTv,
  onClaimTvCode,
  tvClaimStatus,
  onRemoteTogglePlay,
  onRemoteSeekDelta,
  onSendTvRemoteCommand,
  onSwitchThisDeviceToTvLobby,
  onTriggerAirPlayPicker,
}) => {
  const [tvCodeInput, setTvCodeInput] = useState('');
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showWirelessDrawer, setShowWirelessDrawer] = useState(false);
  const [forceShowRemote, setForceShowRemote] = useState(false);
  const [pairedCodeLabel, setPairedCodeLabel] = useState<string | null>(null);

  if (!isOpen) return null;

  const showRemoteView = hasConnectedSmartTv || forceShowRemote || Boolean(pairedCodeLabel);
  const tvUrl = `${window.location.origin}/tv`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&bgcolor=0B0B11&color=FFFFFF&data=${encodeURIComponent(
    tvUrl
  )}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tvCodeInput.replace(/\D/g, '').slice(0, 4);
    if (clean.length === 4) {
      await onClaimTvCode(clean);
      setPairedCodeLabel(clean);
      setTvCodeInput('');
    }
  };

  const handleCopyTvUrl = async () => {
    try {
      await navigator.clipboard.writeText(tvUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleMapCommand = (
    action:
      | 'toggle_play'
      | 'seek_delta'
      | 'toggle_mute'
      | 'volume_delta'
      | 'set_volume'
      | 'force_sync'
      | 'toggle_fullscreen'
      | 'cycle_aspect'
      | 'toggle_ambilight',
    value?: number
  ) => {
    if (action === 'toggle_play') {
      onRemoteTogglePlay();
    } else if (action === 'seek_delta') {
      onRemoteSeekDelta(value || 10);
    } else if (action === 'toggle_mute') {
      onSendTvRemoteCommand('toggle_mute');
    } else if (action === 'volume_delta') {
      onSendTvRemoteCommand((value || 0) >= 0 ? 'vol_up' : 'vol_down');
    } else if (action === 'set_volume') {
      onSendTvRemoteCommand((value || 50) >= 50 ? 'vol_up' : 'vol_down');
    } else if (action === 'force_sync') {
      onSendTvRemoteCommand('reload_tv');
    } else if (action === 'toggle_fullscreen') {
      onSendTvRemoteCommand('toggle_fullscreen');
    } else if (action === 'cycle_aspect') {
      onSendTvRemoteCommand('toggle_aspect');
    } else if (action === 'toggle_ambilight') {
      onSendTvRemoteCommand('toggle_ambilight');
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={showRemoteView ? 'Mando Haptic Touch TV' : 'Conectar Smart TV'}
      subtitle={
        showRemoteView
          ? `Control táctil en tiempo real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`
          : `Paso ${wizardStep} de 2 · Vinculación rápida sin cables`
      }
      icon={<Tv className="w-5 h-5" />}
      maxWidth="sm:max-w-md"
    >
      {tvClaimStatus && (
        <div
          className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in ${
            tvClaimStatus.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
          }`}
        >
          <span>{tvClaimStatus.message}</span>
        </div>
      )}

      {showRemoteView ? (
        /* ================================================================== */
        /* CONNECTED STATE: HAPTIC TOUCH TRACKPAD + VOLUME SLIDER             */
        /* ================================================================== */
        <div className="space-y-3">
          <HapticTvRemote
            pairedTvCode={pairedCodeLabel || 'ACTIVA'}
            onCommand={handleMapCommand}
            onDisconnect={() => {
              onSendTvRemoteCommand('disconnect_tv');
              setPairedCodeLabel(null);
              setForceShowRemote(false);
            }}
          />
          <SecondaryButton
            type="button"
            onClick={() => {
              setForceShowRemote(false);
              setPairedCodeLabel(null);
            }}
            fullWidth
          >
            Vincular otro televisor con código
          </SecondaryButton>
        </div>
      ) : (
        /* ================================================================== */
        /* 1-TAP DIRECT CAST + 2-STEP VISUAL ONBOARDING WIZARD                */
        /* ================================================================== */
        <div className="space-y-4">
          {/* Instant 1-Tap Direct Cast Banner (Chromecast / AirPlay 2 / Smart View) */}
          <div className="p-3.5 rounded-3xl bg-gradient-to-r from-[#E11D48]/18 via-[#141622] to-sky-500/15 border border-[#E11D48]/35 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#FB7185] flex items-center gap-1.5">
                <Cast className="w-3.5 h-3.5" />
                <span>Envío Directo sin Código</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Chromecast, AirPlay 2, Google TV o Samsung Smart View en 1 toque.
              </p>
            </div>
            <PrimaryButton
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                onClose();
              }}
              size="md"
              className="shrink-0 !px-4"
            >
              <Cast className="w-4 h-4" />
              <span>Cast Directo</span>
            </PrimaryButton>
          </div>

          {/* Step Progress Indicator */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className={`flex-1 h-2 rounded-full transition-all cursor-pointer ${
                wizardStep === 1 ? 'bg-[#E11D48]' : 'bg-[#E11D48]/40'
              }`}
              aria-label="Paso 1"
            />
            <button
              type="button"
              onClick={() => setWizardStep(2)}
              className={`flex-1 h-2 rounded-full transition-all cursor-pointer ${
                wizardStep === 2 ? 'bg-[#E11D48]' : 'bg-white/10'
              }`}
              aria-label="Paso 2"
            />
          </div>

          {wizardStep === 1 ? (
            /* STEP 1: Visual TV URL + QR Card */
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-3xl bg-white/[0.03] border border-white/[0.08] text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E11D48]/15 border border-[#E11D48]/30 text-[11px] font-bold text-[#FB7185]">
                  <span>PASO 1</span>
                  <span>·</span>
                  <span>EN TU TELEVISOR</span>
                </div>

                <h4 className="text-base font-bold text-white">
                  Abre el navegador de tu TV
                </h4>
                <p className="text-xs text-zinc-400">
                  Entra en esta dirección en tu televisor para ver tu código de 4 dígitos:
                </p>

                <div className="p-3 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs sm:text-sm font-bold text-[#FB7185] truncate select-all">
                    {tvUrl.replace(/^https?:\/\//, '')}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyTvUrl}
                    className="min-h-[38px] px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Clean Visual QR Code */}
                <div className="pt-2 flex flex-col items-center gap-2">
                  <div className="p-2.5 rounded-2xl bg-[#0B0B11] border border-white/10 shadow-inner">
                    <img
                      src={qrImageUrl}
                      alt="QR Smart TV"
                      className="w-28 h-28 rounded-xl"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5" />
                    O escanea para abrir el receptor TV
                  </span>
                </div>
              </div>

              <PrimaryButton
                type="button"
                onClick={() => setWizardStep(2)}
                fullWidth
                size="lg"
              >
                <span>Ya veo los 4 dígitos en mi TV</span>
                <ArrowRight className="w-4 h-4" />
              </PrimaryButton>

              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton
                  type="button"
                  onClick={() => setForceShowRemote(true)}
                  fullWidth
                >
                  <Tv className="w-4 h-4 text-[#E11D48]" />
                  <span>Abrir Mando TV</span>
                </SecondaryButton>

                {onSwitchThisDeviceToTvLobby && (
                  <SecondaryButton
                    type="button"
                    onClick={onSwitchThisDeviceToTvLobby}
                    fullWidth
                  >
                    <span>Modo Receptor TV</span>
                  </SecondaryButton>
                )}
              </div>
            </div>
          ) : (
            /* STEP 2: Giant 4-Digit Input Display */
            <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
              <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/[0.08] text-center space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="min-h-[36px] px-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Paso 1</span>
                  </button>
                  <span className="px-3 py-1 rounded-full bg-[#E11D48]/15 border border-[#E11D48]/30 text-[11px] font-bold text-[#FB7185]">
                    PASO 2 · CÓDIGO TV
                  </span>
                  <div className="w-14" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">
                    Introduce los 4 dígitos
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Escribe el número que aparece en grande en tu televisor
                  </p>
                </div>

                {/* Giant High-Contrast 4-Digit Code Input */}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoFocus
                  value={tvCodeInput}
                  onChange={(e) =>
                    setTvCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="0000"
                  className="w-full h-20 rounded-2xl bg-black/75 border-2 border-white/15 focus:border-[#E11D48] text-center font-mono text-4xl font-bold tracking-[0.45em] text-white placeholder:text-zinc-700 focus:outline-none transition-all shadow-inner"
                />

                <PrimaryButton
                  type="submit"
                  disabled={tvCodeInput.length !== 4}
                  fullWidth
                  size="lg"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Conectar Smart TV</span>
                </PrimaryButton>
              </div>
            </form>
          )}

          {/* Progressive Disclosure: Direct Wireless Cast / AirPlay / Smart View */}
          <div className="pt-2 border-t border-white/[0.07]">
            <SecondaryButton
              type="button"
              onClick={() => setShowWirelessDrawer((prev) => !prev)}
              fullWidth
            >
              <Cast className="w-4 h-4 text-sky-400" />
              <span>
                {showWirelessDrawer
                  ? 'Ocultar opciones de protocolo directo'
                  : 'Seleccionar protocolo (Chromecast / AirPlay 2 / Smart View)'}
              </span>
            </SecondaryButton>

            {showWirelessDrawer && (
              <div className="grid grid-cols-3 gap-2 mt-2.5 animate-fade-in">
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                    onClose();
                  }}
                  className="flex-col !py-3 text-[11px]"
                >
                  <Cast className="w-4 h-4 text-sky-400" />
                  <span>Chromecast</span>
                </SecondaryButton>

                <SecondaryButton
                  type="button"
                  onClick={() => {
                    if (onTriggerAirPlayPicker) {
                      onTriggerAirPlayPicker();
                    }
                    window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                    onClose();
                  }}
                  className="flex-col !py-3 text-[11px]"
                >
                  <Airplay className="w-4 h-4 text-zinc-200" />
                  <span>AirPlay 2</span>
                </SecondaryButton>

                <SecondaryButton
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                    onClose();
                  }}
                  className="flex-col !py-3 text-[11px]"
                >
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Smart View</span>
                </SecondaryButton>
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
