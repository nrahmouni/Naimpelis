import React, { useEffect, useState } from 'react';
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
  MonitorPlay,
} from 'lucide-react';
import { AppLanguage, TvRemoteCommandType } from '../types';
import {
  BottomSheet,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
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

type SmartTvTab = 'pair' | 'apps' | 'remote';

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
  const [pairedCodeLabel, setPairedCodeLabel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SmartTvTab>(
    hasConnectedSmartTv ? 'remote' : 'pair'
  );

  useEffect(() => {
    if (hasConnectedSmartTv) {
      setActiveTab('remote');
    }
  }, [hasConnectedSmartTv]);

  if (!isOpen) return null;

  const publicHost = getDisplayAppHost();
  const publicOrigin = `https://${publicHost}`;
  const tvUrl = buildTvPairingUrl();
  const iptvM3uUrl = `${publicOrigin}/naim-cine.m3u`;
  const iptvEpgUrl = `${publicOrigin}/epg.xml`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&bgcolor=0E0E10&color=FFFFFF&data=${encodeURIComponent(
    tvUrl
  )}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tvCodeInput.replace(/\D/g, '').slice(0, 4);
    if (clean.length === 4) {
      await onClaimTvCode(clean);
      setPairedCodeLabel(clean);
      setTvCodeInput('');
      setActiveTab('remote');
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
      title={activeTab === 'remote' ? 'Mando Haptic Touch TV' : 'Smart TV y Apps Android'}
      subtitle={
        activeTab === 'remote'
          ? `Control táctil directo · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala activa'}`
          : 'Envía a tu televisor o descarga las APK nativas de Móvil y Google TV'
      }
      icon={<Tv className="w-5 h-5" />}
      maxWidth="sm:max-w-lg"
    >
      <SegmentedControl<SmartTvTab>
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { id: 'pair', label: 'Vincular TV', icon: <Cast className="w-3.5 h-3.5" /> },
          { id: 'apps', label: 'Apps APK & IPTV', icon: <Download className="w-3.5 h-3.5" /> },
          { id: 'remote', label: 'Mando', icon: <Tv className="w-3.5 h-3.5" /> },
        ]}
      />

      {tvClaimStatus && (
        <div
          className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            tvClaimStatus.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
          }`}
        >
          <span>{tvClaimStatus.message}</span>
        </div>
      )}

      {activeTab === 'remote' && (
        <div className="space-y-3">
          <HapticTvRemote
            pairedTvCode={pairedCodeLabel || 'ACTIVA'}
            onCommand={handleMapCommand}
            onDisconnect={() => {
              onSendTvRemoteCommand('disconnect_tv');
              setPairedCodeLabel(null);
              setActiveTab('pair');
            }}
          />
          <SecondaryButton
            type="button"
            onClick={() => {
              setPairedCodeLabel(null);
              setActiveTab('pair');
            }}
            fullWidth
          >
            Vincular otro televisor con código
          </SecondaryButton>
        </div>
      )}

      {activeTab === 'pair' && (
        <div className="space-y-3.5">
          {/* Direct 1-tap Cast */}
          <div className="p-3.5 rounded-2xl nc-specular-surface border border-white/10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF] flex items-center gap-1.5">
                <Cast className="w-3.5 h-3.5" />
                <span>Envío inalámbrico 1 toque</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Chromecast, AirPlay 2 o Samsung Smart View sin escribir código.
              </p>
            </div>
            <PrimaryButton
              type="button"
              onClick={() => {
                if (onTriggerAirPlayPicker) {
                  onTriggerAirPlayPicker();
                }
                window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                onClose();
              }}
              size="md"
              className="shrink-0 whitespace-nowrap"
            >
              <Cast className="w-4 h-4" />
              <span>Enviar</span>
            </PrimaryButton>
          </div>

          {/* 4-Digit Smart TV Pairing */}
          <form
            onSubmit={handleSubmit}
            className="p-4 rounded-2xl nc-specular-surface border border-[#9146FF]/35 space-y-3"
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF]">
                Código Smart TV (4 dígitos)
              </div>
              <p className="text-xs text-zinc-300 mt-0.5">
                Abre{' '}
                <span className="font-mono font-bold text-white">
                  {tvUrl.replace(/^https?:\/\//, '')}
                </span>{' '}
                en tu TV e introduce el código:
              </p>
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
                className="flex-1 h-14 rounded-2xl bg-[#0B0B0E] border border-white/15 focus:border-[#9146FF] text-center font-mono text-2xl font-bold tracking-[0.4em] text-white placeholder:text-zinc-700 focus:outline-none transition-all tabular-nums"
              />

              <PrimaryButton
                type="submit"
                disabled={tvCodeInput.length !== 4}
                size="lg"
                className="shrink-0 !h-14 !px-5 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                <span>Vincular</span>
              </PrimaryButton>
            </div>

            <div className="pt-1.5 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowTvGuide((v) => !v)}
                className="w-full py-1.5 text-xs font-medium text-zinc-400 hover:text-white flex items-center justify-between cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-[#BF94FF]" />
                  <span>Ver enlace rápido y QR para tu televisor</span>
                </span>
                {showTvGuide ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showTvGuide && (
                <div className="mt-2.5 p-3 rounded-2xl bg-black/60 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#BF94FF] truncate select-all">
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
                      Abre el navegador de tu Smart TV y entra en la dirección superior para obtener el código de 4 dígitos al instante.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* Protocol quick triggers + Receiver Mode */}
          <div className="grid grid-cols-3 gap-2">
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

            {onSwitchThisDeviceToTvLobby ? (
              <SecondaryButton
                type="button"
                onClick={onSwitchThisDeviceToTvLobby}
                className="flex-col !py-2.5 text-[11px]"
              >
                <MonitorPlay className="w-4 h-4 text-[#BF94FF]" />
                <span>Modo TV</span>
              </SecondaryButton>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {activeTab === 'apps' && (
        <div className="space-y-3">
          {/* Android Mobile Native APK */}
          <div className="p-3.5 rounded-2xl nc-specular-surface border border-[#9146FF]/35 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>App Nativa Android Móvil (.APK)</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Mismo diseño Obsidian & Violeta que la Web, barra inferior flotante, Media3 HD y salas en vivo.
              </p>
            </div>
            <a
              href="/NAIM-CINE.apk?v=240"
              download="NAIM-CINE.apk"
              className="min-h-11 px-4 rounded-xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-all shadow-[0_8px_22px_rgba(145,70,255,0.35)]"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>APK Móvil</span>
            </a>
          </div>

          {/* Google TV Native APK */}
          <div className="p-3.5 rounded-2xl nc-specular-surface border border-white/12 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>App Nativa Google TV (.APK)</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                Misma estética WebApp adaptada a 10 pies y 100% compatible con mando físico D-pad.
              </p>
            </div>
            <a
              href="/NAIM-CINE-TV.apk?v=240"
              download="NAIM-CINE-TV.apk"
              className="min-h-11 px-4 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
            >
              <Download className="w-4 h-4 text-[#BF94FF] shrink-0" />
              <span>APK TV</span>
            </a>
          </div>

          {/* Samsung Smart TV IPTV (.M3U Playlist + XMLTV EPG) */}
          <div className="p-3.5 rounded-2xl nc-specular-surface border border-sky-500/25 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-sky-400" />
                  <span>Samsung / LG IPTV (.M3U + EPG)</span>
                </div>
                <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                  Canales en directo listos para OTTplayer, IPTV Smarters o Smart IPTV.
                </p>
              </div>
              <a
                href="/naim-cine.m3u?download=1"
                download="NAIM-CINE-Samsung-TV.m3u"
                className="min-h-10 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>.M3U</span>
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopyIptvLink('m3u')}
                className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                {copiedIptv === 'm3u' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>URL Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>Copiar .M3U</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopyIptvLink('epg')}
                className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                {copiedIptv === 'epg' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>EPG Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Copiar EPG</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
