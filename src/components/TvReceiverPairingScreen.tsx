import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tv,
  Smartphone,
  Volume2,
  Check,
  RefreshCw,
  Wifi,
  ArrowLeft,
  ArrowRight,
  Maximize,
  Minimize,
  Download,
  Copy,
  CheckCheck,
  ListVideo,
  FileCode2,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AppLanguage } from '../types';
import { NaimBrandLogo } from './NaimBrandLogo';
import { pickLang } from '../utils/i18n';
import {
  buildEpgXmlUrl,
  buildM3uPlaylistUrl,
  buildTvPairingUrl,
  extractRoomCodeFromInput,
  getDisplayAppHost,
  getDisplayTvPairingLabel,
} from '../utils/shortLink';

interface TvReceiverPairingScreenProps {
  lang: AppLanguage;
  onPaired: (params: {
    roomId: string;
    roomName: string;
    tvAuthToken: string;
  }) => void;
  onExitTvLobby: () => void;
}

export const TvReceiverPairingScreen: React.FC<TvReceiverPairingScreenProps> = ({
  lang,
  onPaired,
  onExitTvLobby,
}) => {
  const [pairingCode, setPairingCode] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const [directRoomDraft, setDirectRoomDraft] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pairedByBanner, setPairedByBanner] = useState<string | null>(null);
  const [showIptvModal, setShowIptvModal] = useState<boolean>(false);
  const [copiedIptvField, setCopiedIptvField] = useState<'m3u' | 'epg' | 'tv' | null>(null);
  const [lastSavedRoom] = useState<{
    roomId: string;
    roomName: string;
    claimedBy: string;
  } | null>(() => {
    try {
      const stored = localStorage.getItem('naim_tv_last_room_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    const onFs = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  const toggleTvBrowserFullscreen = () => {
    unlockTvAudioGesture();
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      return;
    }
    if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
  };

  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef<string>('');
  const hasPairedRef = useRef<boolean>(false);

  const liveTvLabel = getDisplayTvPairingLabel();
  const liveHostLabel = getDisplayAppHost();
  const m3uUrl = buildM3uPlaylistUrl(false);
  const m3uDownloadUrl = buildM3uPlaylistUrl(true);
  const epgUrl = buildEpgXmlUrl(false);
  const epgDownloadUrl = buildEpgXmlUrl(true);
  const tvPairingFullUrl = buildTvPairingUrl();

  const handleCopyIptvUrl = async (value: string, kind: 'm3u' | 'epg' | 'tv') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIptvField(kind);
      setTimeout(() => setCopiedIptvField(null), 2200);
    } catch {
      // ignore
    }
  };

  const completePairingOnce = useCallback(
    (params: {
      roomId: string;
      roomName?: string;
      claimedBy?: string;
      tvAuthToken?: string;
    }) => {
      if (hasPairedRef.current) return;
      hasPairedRef.current = true;
      const cleanRoomId = String(params.roomId).trim().toLowerCase();
      const resolvedTitle =
        params.roomName ||
        pickLang(lang, {
          es: `Sala ${cleanRoomId.toUpperCase()}`,
          ca: `Sala ${cleanRoomId.toUpperCase()}`,
          en: `Room ${cleanRoomId.toUpperCase()}`,
        });

      const deviceFallback = pickLang(lang, {
        es: 'tu móvil',
        ca: 'el teu mòbil',
        en: 'your phone',
      });
      const who = params.claimedBy || deviceFallback;
      setPairedByBanner(
        pickLang(lang, {
          es: `✓ Vinculada por ${who} · Entrando a ${resolvedTitle}...`,
          ca: `✓ Vinculada per ${who} · Entrant a ${resolvedTitle}...`,
          en: `✓ Paired by ${who} · Entering ${resolvedTitle}...`,
        })
      );

      try {
        localStorage.setItem(
          'naim_tv_last_room_v1',
          JSON.stringify({
            roomId: cleanRoomId,
            roomName: resolvedTitle,
            claimedBy: who,
            time: Date.now(),
          })
        );
      } catch {
        // ignore
      }

      setTimeout(() => {
        onPaired({
          roomId: cleanRoomId,
          roomName: resolvedTitle,
          tvAuthToken: String(params.tvAuthToken || ''),
        });
      }, 450);
    },
    [lang, onPaired]
  );

  const registerViaHttp = useCallback(async (forceNew = false) => {
    try {
      const res = await fetch('/api/tv/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceNew,
          existingCode: forceNew ? '' : codeRef.current,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && data?.code) {
        const nextCode = String(data.code);
        codeRef.current = nextCode;
        setPairingCode(nextCode);
        setConnected(true);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'TV_REGISTER_PAIRING',
              payload: { existingCode: nextCode },
            })
          );
        }
      }
    } catch {
      // WebSocket or next poll cycle will retry
    }
  }, []);

  const unlockTvAudioGesture = () => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
      setAudioUnlocked(true);
    } catch {
      setAudioUnlocked(true);
    }
  };

  const requestFreshCode = useCallback(() => {
    hasPairedRef.current = false;
    registerViaHttp(true);
  }, [registerViaHttp]);

  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let httpPollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshCodeTimer: ReturnType<typeof setInterval> | null = null;

    // 1. Immediate HTTP registration (<150ms on Samsung Tizen even if WS is blocked!)
    registerViaHttp(false);

    // 2. WebSocket real-time channel (instant push when available)
    const connectPairingSocket = () => {
      if (!active) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (!active) return;
          setConnected(true);
          socket.send(
            JSON.stringify({
              type: 'TV_REGISTER_PAIRING',
              payload: { existingCode: codeRef.current },
            })
          );
        };

        socket.onmessage = (ev) => {
          if (!active) return;
          try {
            const msg = JSON.parse(ev.data);
            if (
              (msg.type === 'TV_PAIRING_READY' || msg.type === 'TV_PAIRING_CODE') &&
              msg.payload?.code
            ) {
              const nextCode = String(msg.payload.code);
              codeRef.current = nextCode;
              setPairingCode(nextCode);
              setConnected(true);
            } else if (msg.type === 'TV_PAIRED_REDIRECT' && msg.payload?.roomId) {
              const { roomId, roomName, claimedBy, pairedBy, tvAuthToken } = msg.payload;
              completePairingOnce({
                roomId: String(roomId),
                roomName: roomName ? String(roomName) : undefined,
                claimedBy: claimedBy || pairedBy ? String(claimedBy || pairedBy) : undefined,
                tvAuthToken: String(tvAuthToken || ''),
              });
            }
          } catch {
            // ignore malformed messages
          }
        };

        socket.onclose = () => {
          if (!active) return;
          reconnectTimer = setTimeout(connectPairingSocket, 2500);
        };
      } catch {
        // Fallback HTTP polling continues uninterrupted on older Smart TV browsers
      }
    };

    connectPairingSocket();

    // 3. Resilient HTTP Polling Fallback every 2s for Samsung Tizen / LG webOS browsers
    httpPollTimer = setInterval(async () => {
      if (!active || hasPairedRef.current) return;
      const currentCode = codeRef.current;
      if (!currentCode) {
        await registerViaHttp(false);
        return;
      }
      try {
        const res = await fetch(`/api/tv/poll/${encodeURIComponent(currentCode)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active || hasPairedRef.current) return;

        if (data?.paired && data?.roomId) {
          completePairingOnce({
            roomId: String(data.roomId),
            roomName: data.roomName ? String(data.roomName) : undefined,
            claimedBy: data.claimedBy ? String(data.claimedBy) : undefined,
            tvAuthToken: String(data.tvAuthToken || ''),
          });
        } else if (data?.expired) {
          await registerViaHttp(true);
        } else if (data?.success) {
          setConnected(true);
        }
      } catch {
        // transient offline
      }
    }, 2000);

    // 4. Auto-refresh before 15-min expiry so TV can wait on standby indefinitely
    refreshCodeTimer = setInterval(() => {
      if (!hasPairedRef.current) {
        registerViaHttp(true);
      }
    }, 12 * 60 * 1000);

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (httpPollTimer) clearInterval(httpPollTimer);
      if (refreshCodeTimer) clearInterval(refreshCodeTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [completePairingOnce, registerViaHttp]);

  const handleDirectRoomEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = extractRoomCodeFromInput(directRoomDraft);
    if (!parsed) return;
    unlockTvAudioGesture();
    completePairingOnce({
      roomId: parsed,
      roomName: pickLang(lang, {
        es: `Sala ${parsed.toUpperCase()}`,
        ca: `Sala ${parsed.toUpperCase()}`,
        en: `Room ${parsed.toUpperCase()}`,
      }),
      claimedBy: pickLang(lang, {
        es: 'Mando TV',
        ca: 'Comandament TV',
        en: 'TV Remote',
      }),
      tvAuthToken: '',
    });
  };

  const digits = pairingCode ? pairingCode.split('') : ['•', '•', '•', '•'];

  return (
    <div className="min-h-screen w-full bg-[#0B0B0F] text-[#EFEFF1] flex flex-col justify-between p-5 sm:p-10 lg:p-12 relative overflow-x-clip select-none">
      {/* Ambient Aurora & Broadcast Lighting */}
      <div className="pointer-events-none fixed inset-0 nc-aurora-ambient" />
      <div className="pointer-events-none fixed -top-48 left-1/2 -translate-x-1/2 w-[780px] h-[360px] rounded-full bg-[#9146FF]/18 blur-[150px]" />

      {/* Top TV Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <NaimBrandLogo variant="full" size={44} />
          <div className="min-w-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#9146FF]/15 border border-[#9146FF]/35 text-[11px] font-bold text-[#D8B4FE] uppercase tracking-wider mb-0.5">
              Smart TV
            </span>
            <div className="text-xs sm:text-sm text-zinc-400">
              {liveTvLabel} ·{' '}
              {pickLang(lang, {
                es: 'Receptor compatible con Google TV, Samsung Tizen y LG webOS',
                ca: 'Receptor compatible amb Google TV, Samsung Tizen i LG webOS',
                en: 'Compatible with Google TV, Samsung Tizen & LG webOS',
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-3.5 py-2 rounded-2xl border text-xs sm:text-sm font-medium flex items-center gap-2 backdrop-blur-xl ${
              connected || pairingCode
                ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-300'
                : 'bg-amber-500/12 border-amber-400/35 text-amber-300'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>
              {connected || pairingCode
                ? pickLang(lang, {
                    es: 'TV lista esperando tu móvil',
                    ca: 'TV llesta esperant el teu mòbil',
                    en: 'TV ready for your phone',
                  })
                : pickLang(lang, {
                    es: 'Conectando...',
                    ca: 'Connectant...',
                    en: 'Connecting...',
                  })}
            </span>
          </div>

          <button
            type="button"
            onClick={onExitTvLobby}
            className="min-h-[44px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Salir de Modo TV',
                ca: 'Sortir de Mode TV',
                en: 'Exit TV Mode',
              })}
            </span>
          </button>
        </div>
      </header>

      {/* Center 10-Foot Giant 4-Digit Code Display */}
      <main className="relative z-10 my-auto py-6 max-w-4xl mx-auto w-full flex flex-col items-center text-center space-y-7">
        <div className="space-y-2.5 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#C6A2FF] tracking-wide uppercase">
            <Tv className="w-4 h-4 text-[#A970FF]" />
            <span>
              {pickLang(lang, {
                es: 'Código de vinculación rápida para Google TV / Smart TV',
                ca: 'Codi de vinculació ràpida per a Google TV / Smart TV',
                en: 'Quick pairing code for Google TV / Smart TV',
              })}
            </span>
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-4xl lg:text-5xl text-white tracking-tight">
            {pickLang(lang, {
              es: 'Introduce estos 4 números en tu móvil',
              ca: 'Introdueix aquests 4 números al teu mòbil',
              en: 'Enter these 4 digits on your phone',
            })}
          </h1>
          <p className="text-sm sm:text-lg text-zinc-400 leading-relaxed">
            {pickLang(lang, {
              es: 'En tu móvil entra a tu sala de RiffanTV, toca el botón TV y escribe este código:',
              ca: 'Al teu mòbil entra a la teva sala de RiffanTV, toca el botó TV i escriu aquest codi:',
              en: 'On your phone, open your RiffanTV room, tap the TV button, and enter this code:',
            })}
          </p>
        </div>

        {/* 4 Giant Illuminated Specular Broadcast Digit Tiles */}
        <div
          className="flex items-center justify-center gap-3 sm:gap-6"
          aria-label={
            pairingCode
              ? pickLang(lang, {
                  es: `Código de vinculación ${pairingCode.split('').join(' ')}`,
                  ca: `Codi de vinculació ${pairingCode.split('').join(' ')}`,
                  en: `Pairing code ${pairingCode.split('').join(' ')}`,
                })
              : undefined
          }
        >
          {digits.map((digit, index) => (
            <div
              key={index}
              className="w-20 h-28 sm:w-28 sm:h-36 lg:w-36 lg:h-44 rounded-3xl bg-gradient-to-b from-[#1B1B24] to-[#111116] border border-[#9146FF]/45 shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_40px_rgba(145,70,255,0.22),inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center font-mono font-bold text-5xl sm:text-7xl lg:text-8xl text-white tabular-nums"
            >
              {digit}
            </div>
          ))}
        </div>

        {/* 1-Touch Smart Reconnect to Previous Room */}
        {lastSavedRoom && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                unlockTvAudioGesture();
                onPaired({
                  roomId: lastSavedRoom.roomId,
                  roomName: lastSavedRoom.roomName,
                  tvAuthToken: '',
                });
              }}
              className="min-h-[58px] px-8 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-white font-display font-bold text-base sm:text-lg flex items-center gap-3 cursor-pointer shadow-[0_12px_36px_rgba(145,70,255,0.4)] active:scale-95 transition-all"
            >
              <Tv className="w-5 h-5 text-white" />
              <span>
                {pickLang(lang, {
                  es: `Reconectar a ${lastSavedRoom.roomName} (Pulsa OK)`,
                  ca: `Reconnectar a ${lastSavedRoom.roomName} (Prem OK)`,
                  en: `Reconnect to ${lastSavedRoom.roomName} (Press OK)`,
                })}
              </span>
            </button>
          </div>
        )}

        {pairedByBanner ? (
          <div className="px-6 py-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 font-display font-bold text-base sm:text-xl">
            {pairedByBanner}
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={unlockTvAudioGesture}
                className={`min-h-[52px] px-6 rounded-2xl border font-semibold text-sm sm:text-base flex items-center gap-2.5 cursor-pointer transition-all ${
                  audioUnlocked
                    ? 'bg-emerald-500/18 border-emerald-400/45 text-emerald-200'
                    : 'bg-[#9146FF] hover:bg-[#772CE8] border-[#9146FF] text-white shadow-[0_12px_36px_rgba(145,70,255,0.4)]'
                }`}
              >
                {audioUnlocked ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>
                      {pickLang(lang, {
                        es: 'Sonido de TV activado y listo',
                        ca: 'So de la TV activat i llest',
                        en: 'TV Audio Enabled & Ready',
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-5 h-5" />
                    <span>
                      {pickLang(lang, {
                        es: 'Pulsa OK aquí con el mando de la TV para activar sonido',
                        ca: 'Prem OK aquí amb el comandament de la TV per activar el so',
                        en: 'Press OK once with TV remote to enable sound',
                      })}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={toggleTvBrowserFullscreen}
                className="min-h-[52px] px-5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-white text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                {isFullscreen ? (
                  <>
                    <Minimize className="w-4 h-4 text-[#BF94FF]" />
                    <span>
                      {pickLang(lang, {
                        es: 'Salir Pantalla Completa',
                        ca: 'Sortir de Pantalla Completa',
                        en: 'Exit Fullscreen',
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Maximize className="w-4 h-4 text-[#BF94FF]" />
                    <span>
                      {pickLang(lang, {
                        es: 'Pantalla Completa TV',
                        ca: 'Pantalla Completa TV',
                        en: 'TV Fullscreen',
                      })}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={requestFreshCode}
                className="min-h-[52px] px-5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-sm font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-zinc-300" />
                <span>
                  {pickLang(lang, {
                    es: 'Nuevo código',
                    ca: 'Nou codi',
                    en: 'New code',
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowIptvModal(true)}
                className="min-h-[52px] px-5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-sm font-semibold text-emerald-200 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <ListVideo className="w-4 h-4 text-emerald-300" />
                <span>
                  {pickLang(lang, {
                    es: 'Lista M3U y EPG XML',
                    ca: 'Llista M3U i EPG XML',
                    en: 'M3U List & EPG XML',
                  })}
                </span>
              </button>
            </div>

            {/* Direct Room Entry on TV (Zero Phone Required Fallback!) */}
            <form
              onSubmit={handleDirectRoomEnter}
              className="mx-auto max-w-lg p-3 rounded-2xl bg-[#10121C] border border-white/[0.09] flex flex-col sm:flex-row items-center gap-2.5"
            >
              <span className="text-xs text-zinc-400 shrink-0 px-1">
                {pickLang(lang, {
                  es: '¿O entrar directo con código de sala?',
                  ca: 'O entrar directe amb codi de sala?',
                  en: 'Or enter room code directly:',
                })}
              </span>
              <div className="flex items-center gap-2 w-full sm:flex-1">
                <input
                  type="text"
                  value={directRoomDraft}
                  onChange={(e) => setDirectRoomDraft(e.target.value)}
                  placeholder={pickLang(lang, {
                    es: 'Ej: k8x4',
                    ca: 'Ex: k8x4',
                    en: 'e.g. k8x4',
                  })}
                  aria-label={pickLang(lang, {
                    es: 'Código de sala directo',
                    ca: 'Codi de sala directe',
                    en: 'Direct room code',
                  })}
                  maxLength={24}
                  className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#0E0E10] border border-white/12 focus:border-[#9146FF] text-center font-mono font-bold text-sm uppercase text-white placeholder:text-zinc-600 outline-none"
                />
                <button
                  type="submit"
                  disabled={!directRoomDraft.trim()}
                  className="h-11 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white disabled:opacity-35 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <span>
                    {pickLang(lang, { es: 'Entrar', ca: 'Entrar', en: 'Join' })}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* IPTV M3U + EPG XML Configuration Modal inside Pairing TV */}
      {showIptvModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="IPTV M3U & EPG XML"
        >
          <div className="w-full max-w-3xl rounded-3xl bg-[#10121C] border border-white/[0.12] shadow-2xl p-5 sm:p-7 space-y-5 my-auto">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="font-display font-bold text-xl sm:text-2xl text-white">
                  {pickLang(lang, {
                    es: 'IPTV Smart TV · Lista M3U y Guía EPG (XML)',
                    ca: 'IPTV Smart TV · Llista M3U i Guia EPG (XML)',
                    en: 'IPTV Smart TV · M3U Playlist & EPG XML Guide',
                  })}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  {pickLang(lang, {
                    es: `Configura tu televisor con las rutas oficiales de ${liveHostLabel}`,
                    ca: `Configura el teu televisor amb les rutes oficials de ${liveHostLabel}`,
                    en: `Configure your TV with official ${liveHostLabel} routes`,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIptvModal(false)}
                aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
                className="min-w-11 min-h-11 rounded-2xl bg-white/[0.06] hover:bg-white/[0.14] text-zinc-200 flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Separated M3U vs EPG XML cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. M3U Playlist */}
              <div className="p-4 rounded-2xl bg-[#161926] border border-[#9146FF]/35 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C4A7FF]">
                  <ListVideo className="w-4 h-4" />
                  <span>
                    {pickLang(lang, {
                      es: '1. Lista M3U (Canales en directo)',
                      ca: '1. Llista M3U (Canals en directe)',
                      en: '1. M3U Playlist (Live Channels)',
                    })}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-black/45 border border-white/[0.08] font-mono text-xs text-white break-all select-all">
                  {m3uUrl}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={m3uDownloadUrl}
                    download="RIFFANTV-IPTV.m3u"
                    className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar .m3u</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyIptvUrl(m3uUrl, 'm3u')}
                    className="min-h-10 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedIptvField === 'm3u' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedIptvField === 'm3u' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* 2. EPG XML */}
              <div className="p-4 rounded-2xl bg-[#161926] border border-emerald-400/35 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <FileCode2 className="w-4 h-4" />
                  <span>
                    {pickLang(lang, {
                      es: '2. Guía EPG / XML (Programación)',
                      ca: '2. Guia EPG / XML (Programació)',
                      en: '2. EPG / XML Guide (TV Schedule)',
                    })}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-black/45 border border-white/[0.08] font-mono text-xs text-white break-all select-all">
                  {epgUrl}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={epgDownloadUrl}
                    download="RIFFANTV-EPG.xml"
                    className="flex-1 min-h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar .xml</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyIptvUrl(epgUrl, 'epg')}
                    className="min-h-10 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedIptvField === 'epg' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedIptvField === 'epg' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Explainer + QR + Ordered Platform Steps */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
              <div className="space-y-2.5 text-xs sm:text-sm text-zinc-300 leading-relaxed">
                <p>
                  <strong className="text-emerald-300">¿Qué es el EPG / XML?</strong> Es el enlace de guía de horarios y logos de canales que piden apps como <strong className="text-white">IBO Player, TiviMate, IPTV Smarters o Smart IPTV</strong>. Pega la ruta <code className="text-[#C4A7FF]">/riffantv.m3u</code> como Lista y <code className="text-emerald-300">/epg.xml</code> como EPG.
                </p>
                <ul className="space-y-1 text-xs text-zinc-400 list-disc pl-5">
                  <li><strong className="text-white">Samsung Tizen / LG webOS:</strong> Abre IBO Player / Smart IPTV → sube la M3U y la URL XMLTV.</li>
                  <li><strong className="text-white">Google TV / Android TV:</strong> En TiviMate o Televizo añade Lista M3U y Fuente EPG.</li>
                  <li><strong className="text-white">Navegador directo:</strong> Entra siempre en <strong className="text-white">{tvPairingFullUrl}</strong> para usar el mando con tu móvil.</li>
                </ul>
              </div>
              <div className="flex flex-col items-center gap-1.5 shrink-0 mx-auto">
                <div className="p-2.5 rounded-2xl bg-white">
                  <QRCodeSVG value={m3uUrl} size={108} level="M" includeMargin={false} />
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">
                  Escanea M3U en el móvil
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Step-by-Step Salon Guide */}
      <footer className="relative z-10 max-w-4xl mx-auto w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
        <div className="p-4 rounded-2xl bg-[#10121C] border border-white/[0.08] flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0">
            1
          </div>
          <div className="text-xs sm:text-sm text-zinc-300 min-w-0">
            <strong className="text-white block mb-0.5">
              {pickLang(lang, {
                es: 'Abre tu sala en el móvil',
                ca: 'Obre la teva sala al mòbil',
                en: 'Open room on phone',
              })}
            </strong>
            <span className="break-all">
              {pickLang(lang, {
                es: `Entra en ${liveHostLabel || 'RiffanTV'} desde tu teléfono.`,
                ca: `Entra a ${liveHostLabel || 'RiffanTV'} des del teu telèfon.`,
                en: `Open ${liveHostLabel || 'RiffanTV'} on your smartphone.`,
              })}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#10121C] border border-white/[0.08] flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0">
            2
          </div>
          <div className="text-xs sm:text-sm text-zinc-300">
            <strong className="text-white block mb-0.5">
              {pickLang(lang, {
                es: 'Pulsa Smart TV o Cast',
                ca: 'Prem Smart TV o Cast',
                en: 'Tap Smart TV or Cast',
              })}
            </strong>
            {pickLang(lang, {
              es: 'Arriba en la barra o dentro del reproductor → escribe estos 4 números.',
              ca: 'A dalt a la barra o dins del reproductor → escriu aquests 4 números.',
              en: 'In the top bar or inside the video player → enter these 4 digits.',
            })}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#10121C] border border-white/[0.08] flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#9146FF]/18 border border-[#9146FF]/40 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-[#BF94FF]" />
          </div>
          <div className="text-xs sm:text-sm text-zinc-300">
            <strong className="text-white block mb-0.5">
              {pickLang(lang, {
                es: 'Mando en tu teléfono',
                ca: 'Comandament al teu telèfon',
                en: 'Phone becomes remote',
              })}
            </strong>
            {pickLang(lang, {
              es: 'Controla Play, Pausa, Volumen y Ambilight desde el sofá.',
              ca: 'Controla Play, Pausa, Volum i Ambilight des del sofà.',
              en: 'Control Play, Pause, Volume & Ambilight from your couch.',
            })}
          </div>
        </div>
      </footer>
    </div>
  );
};
