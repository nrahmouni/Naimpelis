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
  Loader2,
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
import { triggerApkDownload } from '../utils/apkDownload';
import { pickLang } from '../utils/i18n';

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
  lang = 'es',
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
  const [apkStatus, setApkStatus] = useState<{
    flavor: 'mobile' | 'tv' | null;
    state: 'idle' | 'downloading' | 'done' | 'error';
    message?: string;
  }>({ flavor: null, state: 'idle' });
  const [activeTab, setActiveTab] = useState<SmartTvTab>(
    hasConnectedSmartTv ? 'remote' : 'pair'
  );

  const handleApkDownload = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    flavor: 'mobile' | 'tv',
    url: string,
    filename: string
  ) => {
    e.preventDefault();
    if (apkStatus.state === 'downloading') return;
    setApkStatus({ flavor, state: 'downloading' });
    const result = await triggerApkDownload(url, filename);
    if (result.ok) {
      setApkStatus({ flavor, state: 'done' });
      setTimeout(() => setApkStatus({ flavor: null, state: 'idle' }), 3000);
    } else {
      setApkStatus({ flavor, state: 'error', message: result.error });
    }
  };

  useEffect(() => {
    if (hasConnectedSmartTv) {
      setActiveTab('remote');
    }
  }, [hasConnectedSmartTv]);

  if (!isOpen) return null;

  const publicHost = getDisplayAppHost();
  const tvUrl = buildTvPairingUrl();
  const publicOrigin =
    typeof window !== 'undefined' &&
    !(
      /^ais-dev-/i.test(window.location.hostname || '') &&
      import.meta.env?.VITE_PUBLIC_APP_HOST
    )
      ? window.location.origin
      : `https://${publicHost}`;
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

  const activeRoomLabel = pickLang(lang, {
    es: 'Sala activa',
    ca: 'Sala activa',
    en: 'Active room',
  });

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={
        activeTab === 'remote'
          ? pickLang(lang, {
              es: 'Mando Haptic Touch TV',
              ca: 'Comandament Haptic Touch TV',
              en: 'Haptic Touch TV Remote',
            })
          : pickLang(lang, {
              es: 'Smart TV y Apps Android',
              ca: 'Smart TV i Apps Android',
              en: 'Smart TV & Android Apps',
            })
      }
      subtitle={
        activeTab === 'remote'
          ? pickLang(lang, {
              es: `Control táctil directo · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : activeRoomLabel}`,
              ca: `Control tàctil directe · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : activeRoomLabel}`,
              en: `Direct touch control · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : activeRoomLabel}`,
            })
          : pickLang(lang, {
              es: 'Envía a tu televisor o descarga las APK nativas de Móvil y Google TV',
              ca: 'Envia al teu televisor o descarrega les APK natives de Mòbil i Google TV',
              en: 'Cast to your TV or download native Mobile & Google TV APKs',
            })
      }
      icon={<Tv className="w-5 h-5" />}
      maxWidth="sm:max-w-lg"
    >
      <SegmentedControl<SmartTvTab>
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            id: 'pair',
            label: pickLang(lang, { es: 'Vincular TV', ca: 'Vincular TV', en: 'Pair TV' }),
            icon: <Cast className="w-3.5 h-3.5" />,
          },
          {
            id: 'apps',
            label: 'Apps APK',
            icon: <Download className="w-3.5 h-3.5" />,
          },
          {
            id: 'remote',
            label: pickLang(lang, { es: 'Mando', ca: 'Comandament', en: 'Remote' }),
            icon: <Tv className="w-3.5 h-3.5" />,
          },
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
            pairedTvCode={
              pairedCodeLabel ||
              pickLang(lang, { es: 'ACTIVA', ca: 'ACTIVA', en: 'ACTIVE' })
            }
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
            {pickLang(lang, {
              es: 'Vincular otro televisor con código',
              ca: 'Vincular un altre televisor amb codi',
              en: 'Pair another TV with code',
            })}
          </SecondaryButton>
        </div>
      )}

      {activeTab === 'pair' && (
        <div className="space-y-3.5 w-full min-w-0">
          {/* Direct 1-tap Cast */}
          <div className="p-3 sm:p-3.5 rounded-2xl nc-specular-surface border border-white/10 flex items-center justify-between gap-2.5 w-full min-w-0">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF] flex items-center gap-1.5">
                <Cast className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {pickLang(lang, {
                    es: 'Envío inalámbrico 1 toque',
                    ca: 'Enviament sense fils 1 toc',
                    en: '1-Tap Wireless Cast',
                  })}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug break-words">
                {pickLang(lang, {
                  es: 'Chromecast, AirPlay 2 o Samsung Smart View sin escribir código.',
                  ca: 'Chromecast, AirPlay 2 o Samsung Smart View sense escriure codi.',
                  en: 'Chromecast, AirPlay 2 or Samsung Smart View without typing a code.',
                })}
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
              className="shrink-0 whitespace-nowrap !px-3.5 sm:!px-4"
            >
              <Cast className="w-4 h-4 shrink-0" />
              <span>
                {pickLang(lang, { es: 'Enviar', ca: 'Enviar', en: 'Cast' })}
              </span>
            </PrimaryButton>
          </div>

          {/* 4-Digit Smart TV Pairing */}
          <form
            onSubmit={handleSubmit}
            className="p-3.5 sm:p-4 rounded-2xl nc-specular-surface border border-[#9146FF]/35 space-y-3 w-full min-w-0"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF]">
                {pickLang(lang, {
                  es: 'Código Smart TV (4 dígitos)',
                  ca: 'Codi Smart TV (4 dígits)',
                  en: 'Smart TV Code (4 digits)',
                })}
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug break-words">
                {pickLang(lang, { es: 'Abre', ca: 'Obre', en: 'Open' })}{' '}
                <span className="font-mono font-bold text-white break-all">
                  {tvUrl.replace(/^https?:\/\//, '')}
                </span>{' '}
                {pickLang(lang, {
                  es: 'en tu TV e introduce el código:',
                  ca: 'a la teva TV i introdueix el codi:',
                  en: 'on your TV and enter the code:',
                })}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full min-w-0">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                size={4}
                maxLength={4}
                value={tvCodeInput}
                onChange={(e) =>
                  setTvCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="0000"
                aria-label={pickLang(lang, {
                  es: 'Código de 4 dígitos de la Smart TV',
                  ca: 'Codi de 4 dígits de la Smart TV',
                  en: '4-digit Smart TV pairing code',
                })}
                className="w-0 min-w-0 flex-1 h-12 sm:h-14 px-2 rounded-2xl bg-[#0B0B0E] border border-white/15 focus:border-[#9146FF] text-center font-mono text-xl sm:text-2xl font-bold tracking-[0.22em] sm:tracking-[0.4em] text-white placeholder:text-zinc-700 focus:outline-none transition-all tabular-nums"
              />

              <PrimaryButton
                type="submit"
                disabled={tvCodeInput.length !== 4}
                size="lg"
                className="shrink-0 !h-12 sm:!h-14 !px-3.5 sm:!px-5 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: 'Vincular',
                    ca: 'Vincular',
                    en: 'Pair',
                  })}
                </span>
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
                  <span>
                    {pickLang(lang, {
                      es: 'Ver enlace rápido y QR para tu televisor',
                      ca: 'Veure enllaç ràpid i QR per al teu televisor',
                      en: 'View quick link & QR for your TV',
                    })}
                  </span>
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
                          <span>
                            {pickLang(lang, {
                              es: 'Copiado',
                              ca: 'Copiat',
                              en: 'Copied',
                            })}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>
                            {pickLang(lang, {
                              es: 'Copiar URL',
                              ca: 'Copiar URL',
                              en: 'Copy URL',
                            })}
                          </span>
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
                      {pickLang(lang, {
                        es: 'Abre el navegador de tu Smart TV y entra en la dirección superior para obtener el código de 4 dígitos al instante.',
                        ca: 'Obre el navegador de la teva Smart TV i entra a la direcció superior per obtenir el codi de 4 dígits a l’instant.',
                        en: 'Open your Smart TV browser and visit the address above to get the 4-digit pairing code immediately.',
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* Protocol quick triggers + Receiver Mode */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full min-w-0">
            <SecondaryButton
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                onClose();
              }}
              className="flex-col !py-2.5 !px-1.5 sm:!px-3 min-w-0 w-full text-[11px]"
            >
              <Cast className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate max-w-full">Chromecast</span>
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
              className="flex-col !py-2.5 !px-1.5 sm:!px-3 min-w-0 w-full text-[11px]"
            >
              <Airplay className="w-4 h-4 text-zinc-200 shrink-0" />
              <span className="truncate max-w-full">AirPlay 2</span>
            </SecondaryButton>

            {onSwitchThisDeviceToTvLobby ? (
              <SecondaryButton
                type="button"
                onClick={onSwitchThisDeviceToTvLobby}
                className="flex-col !py-2.5 !px-1.5 sm:!px-3 min-w-0 w-full text-[11px]"
              >
                <MonitorPlay className="w-4 h-4 text-[#BF94FF] shrink-0" />
                <span className="truncate max-w-full">
                  {pickLang(lang, { es: 'Modo TV', ca: 'Mode TV', en: 'TV Mode' })}
                </span>
              </SecondaryButton>
            ) : (
              <SecondaryButton
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('naim-trigger-direct-cast'));
                  onClose();
                }}
                className="flex-col !py-2.5 !px-1.5 sm:!px-3 min-w-0 w-full text-[11px]"
              >
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate max-w-full">Smart View</span>
              </SecondaryButton>
            )}
          </div>
        </div>
      )}

      {activeTab === 'apps' && (
        <div className="space-y-3 w-full min-w-0">
          {/* Android Mobile Native APK */}
          <div className="p-3 sm:p-3.5 rounded-2xl nc-specular-surface border border-[#9146FF]/35 flex items-center justify-between gap-2.5 w-full min-w-0">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {pickLang(lang, {
                    es: 'App Android Móvil (.APK)',
                    ca: 'App Android Mòbil (.APK)',
                    en: 'Android Mobile App (.APK)',
                  })}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug break-words">
                {pickLang(lang, {
                  es: 'Mismo diseño Obsidian & Violeta, actualización automática y salas en vivo.',
                  ca: 'Mateix disseny Obsidian & Violeta, actualització automàtica i sales en directe.',
                  en: 'Same Obsidian & Violet design, auto-updates and live watch rooms.',
                })}
              </p>
            </div>
            <a
              href="/NAIM-CINE.apk?v=300"
              download="NAIM-CINE.apk"
              onClick={(e) => handleApkDownload(e, 'mobile', '/NAIM-CINE.apk?v=300', 'NAIM-CINE.apk')}
              className="min-h-11 px-3.5 sm:px-4 rounded-xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-all shadow-[0_8px_22px_rgba(145,70,255,0.35)]"
            >
              {apkStatus.flavor === 'mobile' && apkStatus.state === 'downloading' ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              ) : apkStatus.flavor === 'mobile' && apkStatus.state === 'done' ? (
                <Check className="w-4 h-4 shrink-0 text-emerald-300" />
              ) : (
                <Download className="w-4 h-4 shrink-0" />
              )}
              <span>
                {apkStatus.flavor === 'mobile' && apkStatus.state === 'downloading'
                  ? pickLang(lang, { es: 'Preparando...', ca: 'Preparant...', en: 'Preparing...' })
                  : apkStatus.flavor === 'mobile' && apkStatus.state === 'done'
                  ? pickLang(lang, { es: 'Descargada', ca: 'Descarregada', en: 'Downloaded' })
                  : pickLang(lang, { es: 'APK Móvil', ca: 'APK Mòbil', en: 'Mobile APK' })}
              </span>
            </a>
          </div>

          {/* Google TV Native APK */}
          <div className="p-3 sm:p-3.5 rounded-2xl nc-specular-surface border border-white/12 flex items-center justify-between gap-2.5 w-full min-w-0">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                <span className="truncate">
                  {pickLang(lang, {
                    es: 'App Google TV (.APK)',
                    ca: 'App Google TV (.APK)',
                    en: 'Google TV App (.APK)',
                  })}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug break-words">
                {pickLang(lang, {
                  es: 'Interfaz 10-foot navegable con mando físico D-Pad + código 4 dígitos y OTA.',
                  ca: 'Interfície 10-foot navegable amb comandament físic D-Pad + codi 4 dígits i OTA.',
                  en: '10-foot interface for physical D-Pad remote + 4-digit pairing code & OTA.',
                })}
              </p>
            </div>
            <a
              href="/NAIM-CINE-TV.apk?v=300"
              download="NAIM-CINE-TV.apk"
              onClick={(e) => handleApkDownload(e, 'tv', '/NAIM-CINE-TV.apk?v=300', 'NAIM-CINE-TV.apk')}
              className="min-h-11 px-3.5 sm:px-4 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
            >
              {apkStatus.flavor === 'tv' && apkStatus.state === 'downloading' ? (
                <Loader2 className="w-4 h-4 text-[#BF94FF] shrink-0 animate-spin" />
              ) : apkStatus.flavor === 'tv' && apkStatus.state === 'done' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Download className="w-4 h-4 text-[#BF94FF] shrink-0" />
              )}
              <span>
                {apkStatus.flavor === 'tv' && apkStatus.state === 'downloading'
                  ? pickLang(lang, { es: 'Preparando...', ca: 'Preparant...', en: 'Preparing...' })
                  : apkStatus.flavor === 'tv' && apkStatus.state === 'done'
                  ? pickLang(lang, { es: 'Descargada', ca: 'Descarregada', en: 'Downloaded' })
                  : 'APK TV'}
              </span>
            </a>
          </div>
          {apkStatus.state === 'error' && apkStatus.message && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
              {pickLang(lang, {
                es: `Error al descargar APK: ${apkStatus.message}`,
                ca: `Error en descarregar l'APK: ${apkStatus.message}`,
                en: `APK download error: ${apkStatus.message}`,
              })}
            </div>
          )}

          {/* Samsung Smart TV IPTV (.M3U Playlist + XMLTV EPG) */}
          <div className="p-3.5 rounded-2xl nc-specular-surface border border-sky-500/25 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-sky-400" />
                  <span>Samsung / LG IPTV (.M3U + EPG)</span>
                </div>
                <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                  {pickLang(lang, {
                    es: 'Canales en directo listos para OTTplayer, IPTV Smarters o Smart IPTV.',
                    ca: 'Canals en directe llestos per a OTTplayer, IPTV Smarters o Smart IPTV.',
                    en: 'Live channels ready for OTTplayer, IPTV Smarters or Smart IPTV.',
                  })}
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
                    <span>
                      {pickLang(lang, {
                        es: 'URL Copiada',
                        ca: 'URL Copiada',
                        en: 'URL Copied',
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {pickLang(lang, {
                        es: 'Copiar .M3U',
                        ca: 'Copiar .M3U',
                        en: 'Copy .M3U',
                      })}
                    </span>
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
                    <span>
                      {pickLang(lang, {
                        es: 'EPG Copiada',
                        ca: 'EPG Copiada',
                        en: 'EPG Copied',
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-300" />
                    <span>
                      {pickLang(lang, {
                        es: 'Copiar EPG',
                        ca: 'Copiar EPG',
                        en: 'Copy EPG',
                      })}
                    </span>
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
