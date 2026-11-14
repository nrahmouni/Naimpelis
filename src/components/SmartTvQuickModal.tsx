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
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import { AppLanguage, TvRemoteCommandType } from '../types';
import {
  BottomSheet,
  PrimaryButton,
  SecondaryButton,
  HapticTvRemote,
} from './ui/DesignSystem';
import { buildTvPairingUrl, getDisplayAppHost } from '../utils/shortLink';

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
  const [showTvGuide, setShowTvGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedIptv, setCopiedIptv] = useState<'m3u' | 'epg' | null>(null);
  const [showWirelessDrawer, setShowWirelessDrawer] = useState(false);
  const [forceShowRemote, setForceShowRemote] = useState(false);
  const [pairedCodeLabel, setPairedCodeLabel] = useState<string | null>(null);

  if (!isOpen) return null;

  const showRemoteView = hasConnectedSmartTv || forceShowRemote || Boolean(pairedCodeLabel);
  const publicHost = getDisplayAppHost();
  const publicOrigin = `https://${publicHost}`;
  const tvUrl = buildTvPairingUrl();
  const iptvM3uUrl = `${publicOrigin}/naim-cine.m3u`;
  const iptvEpgUrl = `${publicOrigin}/epg.xml`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&bgcolor=050508&color=FFFFFF&data=${encodeURIComponent(
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

  const handleCopyIptvLink = async (kind: 'm3u' | 'epg') => {
    try {
      await navigator.clipboard.writeText(kind === 'm3u' ? iptvM3uUrl : iptvEpgUrl);
      setCopiedIptv(kind);
      setTimeout(() => setCopiedIptv(null), 2000);
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
      | 'toggle_ambilight'
      | 'cycle_subtitles'
      | 'cycle_audio',
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
    } else if (action === 'cycle_subtitles') {
      onSendTvRemoteCommand('cycle_subtitles');
    } else if (action === 'cycle_audio') {
      onSendTvRemoteCommand('cycle_audio');
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={showRemoteView ? 'Mando Haptic Touch TV' : 'Conectar a Smart TV'}
      subtitle={
        showRemoteView
          ? `Control táctil en tiempo real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`
          : 'Envío directo 1-toque o vinculación por código de 4 dígitos'
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
        /* UNIFIED 1-STEP SMART TV PAIRING & DIRECT CAST                      */
        /* ================================================================== */
        <div className="space-y-3.5">
          {/* 1. Instant 1-Tap Direct Cast Banner (Chromecast / AirPlay 2 / Smart View) */}
          <div className="p-3.5 rounded-2xl bg-[#11131C] border border-white/10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#FB7185] flex items-center gap-1.5">
                <Cast className="w-3.5 h-3.5" />
                <span>Opción A · Cast Directo</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Chromecast, AirPlay 2 o Smart View sin código.
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
              <span>Enviar a TV</span>
            </PrimaryButton>
          </div>

          {/* 1. Primary Option A: 1-Step 4-Digit Smart TV Code Pairing */}
          <form
            onSubmit={handleSubmit}
            className="p-4 rounded-2xl bg-white/[0.04] border border-[#E11D48]/30 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#FB7185]">
                  Opción A · Código Smart TV (4 dígitos)
                </div>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Abre <span className="font-mono font-bold text-white">{tvUrl.replace(/^https?:\/\//, '')}</span> en tu TV e introduce el código:
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
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
                className="flex-1 h-14 rounded-2xl bg-black/80 border border-white/15 focus:border-[#E11D48] text-center font-mono text-2xl font-bold tracking-[0.4em] text-white placeholder:text-zinc-700 focus:outline-none transition-all"
              />

              <PrimaryButton
                type="submit"
                disabled={tvCodeInput.length !== 4}
                size="lg"
                className="shrink-0 !h-14 !px-5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Vincular</span>
              </PrimaryButton>
            </div>

            {/* Expandable helper for TV URL & QR */}
            <div className="pt-1 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowTvGuide((v) => !v)}
                className="w-full py-1.5 text-xs font-medium text-zinc-400 hover:text-white flex items-center justify-between cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-[#FB7185]" />
                  <span>¿Cómo abro el código en mi televisor? (Enlace y QR)</span>
                </span>
                {showTvGuide ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showTvGuide && (
                <div className="mt-2.5 p-3 rounded-2xl bg-black/60 border border-white/10 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#FB7185] truncate select-all">
                      {tvUrl.replace(/^https?:\/\//, '')}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyTvUrl}
                      className="min-h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {copiedUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar URL</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <img
                      src={qrImageUrl}
                      alt="QR Smart TV"
                      className="w-20 h-20 rounded-xl border border-white/10 shrink-0"
                      loading="lazy"
                    />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Abre el navegador web de tu Smart TV y entra en la dirección superior para ver tu código de 4 dígitos al instante.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* 2. Option B: Direct Native Google TV & Android Mobile APKs + IPTV */}
          <div className="p-3.5 rounded-2xl bg-[#11131C] border border-white/12 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-[#FB7185]" />
                <span>Opción B · App Nativa Google TV (.APK)</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Funciona 100% con el mando físico de tu tele sin usar el móvil.
              </p>
            </div>
            <a
              href="/NAIM-CINE-TV.apk?v=240"
              download="NAIM-CINE-TV.apk"
              className="min-h-[42px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>APK TV</span>
            </a>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#11131C] border border-white/12 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-[#FB7185]" />
                <span>App Nativa Móvil Android (.APK)</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Buscador de Cine y Series, motor Media3 HD, Fútbol en directo, Deportes y TDT España.
              </p>
            </div>
            <a
              href="/NAIM-CINE.apk?v=240"
              download="NAIM-CINE.apk"
              className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
            >
              <Download className="w-4 h-4 text-[#FB7185] shrink-0" />
              <span>APK Móvil</span>
            </a>
          </div>

          {/* Samsung Smart TV IPTV (.M3U Playlist + XMLTV EPG) */}
          <div className="p-3.5 rounded-2xl bg-[#11131C] border border-sky-500/25 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-sky-400" />
                  <span>Samsung Smart TV · Lista IPTV (.M3U + EPG)</span>
                </div>
                <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                  Canales en directo (TDT, Movistar+, DAZN, Deportes) listos para OTTplayer, IPTV Smarters, Smart IPTV o SS IPTV.
                </p>
              </div>
              <a
                href="/naim-cine.m3u?download=1"
                download="NAIM-CINE-Samsung-TV.m3u"
                className="min-h-[40px] px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>.M3U</span>
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopyIptvLink('m3u')}
                className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedIptv === 'm3u' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>URL IPTV Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>Copiar URL .M3U</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopyIptvLink('epg')}
                className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedIptv === 'epg' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>URL EPG Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Copiar Guía EPG</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. Quick Actions: Open Touch Remote or Switch Device to TV Receiver */}
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton
              type="button"
              onClick={() => setForceShowRemote(true)}
              fullWidth
            >
              <Tv className="w-4 h-4 text-[#E11D48]" />
              <span>Abrir Mando TV</span>
            </SecondaryButton>

            {onSwitchThisDeviceToTvLobby ? (
              <SecondaryButton
                type="button"
                onClick={onSwitchThisDeviceToTvLobby}
                fullWidth
              >
                <span>Modo Receptor TV</span>
              </SecondaryButton>
            ) : (
              <SecondaryButton
                type="button"
                onClick={() => setShowWirelessDrawer((prev) => !prev)}
                fullWidth
              >
                <Airplay className="w-4 h-4 text-sky-400" />
                <span>Protocolos TV</span>
              </SecondaryButton>
            )}
          </div>

          {showWirelessDrawer && (
            <div className="grid grid-cols-3 gap-2 pt-1 animate-fade-in">
              <SecondaryButton
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                  onClose();
                }}
                className="flex-col !py-2.5 text-[11px]"
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
                className="flex-col !py-2.5 text-[11px]"
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
                className="flex-col !py-2.5 text-[11px]"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Smart View</span>
              </SecondaryButton>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
};
