import React, { useRef } from 'react';
import { ArrowRight, Gamepad2, X } from 'lucide-react';
import type { RoomGameInvite, RoomGameInviteType } from '../../shared/protocol';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { useBackInterceptor } from '../../lib/backInterceptor';

interface GameInviteMeta {
  emoji: string;
  accent: string;
  title: { es: string; ca: string; en: string };
  subtitle: { es: string; ca: string; en: string };
}

const GAME_INVITE_META: Record<RoomGameInviteType, GameInviteMeta> = {
  pool: {
    emoji: '🎱',
    accent: '#10B981',
    title: { es: 'Billar Bola 8', ca: 'Billar Bola 8', en: '8-Ball Pool' },
    subtitle: {
      es: 'Duelo 1v1 en mesa de billar en directo',
      ca: 'Duel 1v1 en taula de billar en directe',
      en: 'Live 1v1 8-ball pool match',
    },
  },
  chapas: {
    emoji: '⚽',
    accent: '#22C55E',
    title: { es: 'Fútbol Chapas', ca: 'Futbol Xapes', en: 'Soccer Caps' },
    subtitle: {
      es: 'Estadio 1v1 / 2v2 · Primero a 3 goles',
      ca: 'Estadi 1v1 / 2v2 · Primer a 3 gols',
      en: '1v1 / 2v2 Stadium · First to 3 goals',
    },
  },
  headsoccer: {
    emoji: '🥅',
    accent: '#38BDF8',
    title: { es: 'Fútbol Cabezones', ca: 'Futbol Capgrossos', en: 'Head Soccer' },
    subtitle: {
      es: 'Estadio arcade 1v1 · 60s de acción',
      ca: 'Estadi arcade 1v1 · 60s d’acció',
      en: '1v1 arcade stadium · 60s action',
    },
  },
  poker: {
    emoji: '♠️',
    accent: '#A855F7',
    title: { es: 'Póker Texas Hold’em', ca: 'Pòquer Texas Hold’em', en: 'Texas Hold’em Poker' },
    subtitle: {
      es: 'Mesa No-Limit con ciegas y botes en sala',
      ca: 'Taula No-Limit amb cegues i pots en sala',
      en: 'No-Limit table with blinds & pots',
    },
  },
  blackjack: {
    emoji: '🃏',
    accent: '#10B981',
    title: { es: 'Blackjack 21', ca: 'Blackjack 21', en: 'Blackjack 21' },
    subtitle: {
      es: 'Mesa de casino contra el crupier · Paga 3:2',
      ca: 'Taula de casino contra el crupier · Paga 3:2',
      en: 'Casino table vs Dealer · Pays 3:2',
    },
  },
  parchis: {
    emoji: '🎲',
    accent: '#F59E0B',
    title: { es: 'Parchís Español', ca: 'Parxís Espanyol', en: 'Spanish Parchís' },
    subtitle: {
      es: 'Elige tu color y juega en el tablero oficial',
      ca: 'Tria el teu color i juga al tauler oficial',
      en: 'Pick your color on the official board',
    },
  },
  uno: {
    emoji: '🃏',
    accent: '#EF4444',
    title: { es: 'UNO Oficial', ca: 'UNO Oficial', en: 'Official UNO' },
    subtitle: {
      es: 'Baraja clásica de 108 cartas con tu sala',
      ca: 'Baralla clàssica de 108 cartes amb la sala',
      en: 'Classic 108-card match with your room',
    },
  },
  pinturillo: {
    emoji: '🎨',
    accent: '#EC4899',
    title: { es: 'Pinturillo', ca: 'Pinturillo', en: 'Draw & Guess' },
    subtitle: {
      es: 'Dibuja y adivina palabras en tiempo real',
      ca: 'Dibuixa i endevina paraules en temps real',
      en: 'Draw and guess words live together',
    },
  },
  chess: {
    emoji: '♟️',
    accent: '#8B5CF6',
    title: { es: 'Ajedrez FIDE', ca: 'Escacs FIDE', en: 'FIDE Chess' },
    subtitle: {
      es: 'Partida 1v1 con reglas oficiales y reloj',
      ca: 'Partida 1v1 amb regles oficials i rellotge',
      en: 'Official 1v1 chess match with optional clock',
    },
  },
  checkers: {
    emoji: '🔴',
    accent: '#F43F5E',
    title: { es: 'Damas Españolas', ca: 'Dames Espanyoles', en: 'Spanish Checkers' },
    subtitle: {
      es: 'Tablero 8×8 clásico con vuelo largo',
      ca: 'Tauler 8×8 clàssic amb vol llarg',
      en: 'Classic 8×8 board with flying kings',
    },
  },
  connect4: {
    emoji: '🟡',
    accent: '#EAB308',
    title: { es: 'Conecta 4', ca: 'Connecta 4', en: 'Connect 4' },
    subtitle: {
      es: 'Duelo rápido de estrategia vertical',
      ca: 'Duel ràpid d’estratègia vertical',
      en: 'Fast vertical strategy duel',
    },
  },
  penalty: {
    emoji: '⚽',
    accent: '#22C55E',
    title: { es: 'Penaltis Mundial Pro', ca: 'Penals Mundial Pro', en: 'World Cup Penalties' },
    subtitle: {
      es: 'Tanda de penaltis 3D con efecto y paradas',
      ca: 'Tanda de penals 3D amb efecte i aturades',
      en: '3D shootout with curve & keeper dives',
    },
  },
  racing3d: {
    emoji: '🏎️',
    accent: '#7C3AED',
    title: { es: 'Nitro GP 3D', ca: 'Nitro GP 3D', en: 'Nitro GP 3D' },
    subtitle: {
      es: 'Carreras 3D sincronizadas con volante móvil',
      ca: 'Curses 3D sincronitzades amb volant mòbil',
      en: '3D racing synced with phone gyroscope wheel',
    },
  },
  gyrohockey: {
    emoji: '🏒',
    accent: '#22D3EE',
    title: { es: 'Neon Air Hockey Gyro', ca: 'Neon Air Hockey Gyro', en: 'Neon Air Hockey Gyro' },
    subtitle: {
      es: 'Duelo de hockey neon con giroscopio móvil',
      ca: 'Duel d’hoquei neó amb giroscopi mòbil',
      en: 'Neon air hockey controlled with mobile gyro',
    },
  },
  gyrospace: {
    emoji: '🚀',
    accent: '#A855F7',
    title: { es: 'Galaxia Interceptor Gyro', ca: 'Galàxia Interceptor Gyro', en: 'Galaxy Interceptor Gyro' },
    subtitle: {
      es: 'Nave espacial controlada inclinando tu smartphone',
      ca: 'Nau espacial controlada inclinant el teu mòbil',
      en: 'Starfighter steered with phone gyroscope tilt',
    },
  },
};

interface GameMatchInviteModalProps {
  invite: RoomGameInvite | null;
  lang: AppLanguage;
  onAccept: (invite: RoomGameInvite) => void;
  onDismiss: () => void;
}

export const GameMatchInviteModal: React.FC<GameMatchInviteModalProps> = ({
  invite,
  lang,
  onAccept,
  onDismiss,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(Boolean(invite), onDismiss, dialogRef);
  useBackInterceptor(Boolean(invite), 'game-match-invite-modal', onDismiss, {
    priority: 18,
  });

  if (!invite) return null;

  const meta = GAME_INVITE_META[invite.gameType] || GAME_INVITE_META.parchis;
  const gameTitle = pickLang(lang, meta.title);
  const gameSubtitle = pickLang(lang, meta.subtitle);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-invite-heading"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl nc-specular-surface bg-[#18181F]/95 border border-white/15 shadow-[0_28px_80px_rgba(0,0,0,0.85)] p-5 sm:p-6 space-y-5 animate-sheet-up relative overflow-hidden"
      >
        {/* Subtle ambient accent glow */}
        <div
          className="pointer-events-none absolute -top-20 -right-16 w-48 h-48 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: meta.accent }}
          aria-hidden="true"
        />

        {/* Header: Inviter + Close */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/[0.08] border border-white/15 flex items-center justify-center text-xl shrink-0">
              {invite.inviterAvatar || '🎮'}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-zinc-400 truncate">
                {pickLang(lang, { es: 'Anfitrión', ca: 'Amfitrió', en: 'Host' })} · {invite.roomName}
              </p>
              <h2
                id="game-invite-heading"
                className="text-base sm:text-lg font-extrabold text-white leading-tight truncate"
              >
                {pickLang(lang, {
                  es: `${invite.inviterName} te invita a jugar`,
                  ca: `${invite.inviterName} et convida a jugar`,
                  en: `${invite.inviterName} invited you to play`,
                })}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onDismiss();
            }}
            aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Game Showcase */}
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.1] p-4 flex items-center gap-3.5 relative z-10">
          <div
            className="w-13 h-13 rounded-2xl border flex items-center justify-center text-3xl shrink-0 shadow-inner"
            style={{
              backgroundColor: `${meta.accent}22`,
              borderColor: `${meta.accent}55`,
            }}
          >
            {meta.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#DFCCFF]">
              <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Partida lista',
                  ca: 'Partida llesta',
                  en: 'Match Ready',
                })}
              </span>
            </div>
            <p className="text-base font-black text-white truncate mt-0.5">{gameTitle}</p>
            <p className="text-xs text-zinc-400 leading-snug mt-0.5">{gameSubtitle}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 relative z-10">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onDismiss();
            }}
            className="min-h-[44px] sm:flex-1 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs sm:text-sm font-bold text-zinc-200 flex items-center justify-center whitespace-nowrap cursor-pointer active:scale-95 transition-all"
          >
            {pickLang(lang, { es: 'Ahora no', ca: 'Ara no', en: 'Not now' })}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              onAccept(invite);
            }}
            className="min-h-[44px] sm:flex-[1.35] px-5 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:from-[#AA70FF] hover:to-[#8438F5] text-xs sm:text-sm font-black text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 transition-all shadow-[0_10px_28px_rgba(145,70,255,0.42),inset_0_1px_0_rgba(255,255,255,0.28)]"
          >
            <span>
              {pickLang(lang, {
                es: 'Ir al juego',
                ca: 'Anar al joc',
                en: 'Join Game',
              })}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
