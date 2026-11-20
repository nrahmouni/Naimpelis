import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowRight,
  Bookmark,
  CalendarPlus,
  Check,
  Cloud,
  Lock,
  LogOut,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';
import type { AppLanguage, CloudSavedRoom } from '../../types';
import { RecentRoomEntry } from '../../utils/storage';
import { triggerHaptic } from '../../utils/haptics';
import { buildShortInviteUrl, extractRoomCodeFromInput } from '../../utils/shortLink';
import { useAppStore } from '../../store/useAppStore';
import { pickLang } from '../../utils/i18n';

interface ProfileAccountRoomCardProps {
  lang: AppLanguage;
  authUser: User | null;
  roomId: string;
  roomName: string;
  recentRooms: RecentRoomEntry[];
  savedRooms: CloudSavedRoom[];
  isCurrentRoomPermanent: boolean;
  onCreateNewRoom: () => void;
  onSwitchRoom: (targetRoomId: string, targetRoomName?: string) => void;
  onToggleCurrentRoomPermanent?: () => void;
  onDeleteSavedRoom?: (roomCode: string) => void;
  onLeaveRoom?: () => void;
  onClose: () => void;
}

export const ProfileAccountRoomCard: React.FC<ProfileAccountRoomCardProps> = ({
  lang,
  authUser,
  roomId,
  roomName,
  recentRooms,
  savedRooms,
  isCurrentRoomPermanent,
  onCreateNewRoom,
  onSwitchRoom,
  onToggleCurrentRoomPermanent,
  onDeleteSavedRoom,
  onLeaveRoom,
  onClose,
}) => {
  const scheduledRooms = useAppStore((s) => s.scheduledRooms);
  const addScheduledRoom = useAppStore((s) => s.addScheduledRoom);
  const removeScheduledRoom = useAppStore((s) => s.removeScheduledRoom);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleTime, setScheduleTime] = useState('22:00');
  const [joinCode, setJoinCode] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleJoinRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractRoomCodeFromInput(joinCode);
    if (!clean) return;
    triggerHaptic('success');
    setJoinCode('');
    onSwitchRoom(clean);
    onClose();
  };

  const handleCopyCurrentInvite = async () => {
    if (!roomId) return;
    triggerHaptic('success');
    const url = buildShortInviteUrl(roomId, false);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.04] nc-specular-surface border border-white/[0.08] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-zinc-400">
            {pickLang(lang, {
              es: 'Sala actual',
              ca: 'Sala actual',
              en: 'Current room',
            })}
          </div>
          <div className="font-display font-bold text-sm sm:text-base text-white">
            {roomName ||
              pickLang(lang, {
                es: `Sala ${roomId.toUpperCase()}`,
                ca: `Sala ${roomId.toUpperCase()}`,
                en: `Room ${roomId.toUpperCase()}`,
              })}{' '}
            <span className="font-mono text-xs text-zinc-400">#{roomId}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyCurrentInvite}
          className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
        >
          {copiedInvite ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#00F593]" />
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
              <Share2 className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Copiar link',
                  ca: 'Copiar enllaç',
                  en: 'Copy link',
                })}
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('success');
            onCreateNewRoom();
            onClose();
          }}
          className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>
            {pickLang(lang, {
              es: 'Nueva sala',
              ca: 'Nova sala',
              en: 'New room',
            })}
          </span>
        </button>

        {authUser && onToggleCurrentRoomPermanent && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onToggleCurrentRoomPermanent();
            }}
            className={`flex-1 min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              isCurrentRoomPermanent
                ? 'bg-emerald-500/18 border-emerald-400/45 text-emerald-200'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/12 text-zinc-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 fill-current" />
            <span>
              {isCurrentRoomPermanent
                ? pickLang(lang, {
                    es: 'Sala Permanente ✓',
                    ca: 'Sala Permanent ✓',
                    en: 'Permanent Room ✓',
                  })
                : pickLang(lang, {
                    es: 'Hacer Permanente',
                    ca: 'Fer Permanent',
                    en: 'Save Permanent',
                  })}
            </span>
          </button>
        )}

        {onLeaveRoom && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
              onLeaveRoom();
            }}
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-[#9146FF]/15 border border-white/12 hover:border-[#9146FF]/35 text-xs font-semibold text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4 text-[#BF94FF]" />
            <span>
              {pickLang(lang, {
                es: 'Salir al Inicio',
                ca: "Sortir a l'Inici",
                en: 'Exit to Home',
              })}
            </span>
          </button>
        )}
      </div>

      <form onSubmit={handleJoinRoomSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder={pickLang(lang, {
            es: 'Unirse a código o link de amigo...',
            ca: "Unir-se a codi o enllaç d'amic...",
            en: 'Join friend code or link...',
          })}
          className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#26262C] border border-white/10 focus:border-[#9146FF] text-base sm:text-xs font-mono text-white placeholder:text-zinc-500 outline-none"
        />
        <button
          type="submit"
          disabled={!joinCode.trim()}
          className="h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 border border-white/12 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>{pickLang(lang, { es: 'Ir', ca: 'Anar', en: 'Join' })}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

      {savedRooms.length > 0 && (
        <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
          <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            <span>
              {pickLang(lang, {
                es: `Salas permanentes en la nube (${savedRooms.length})`,
                ca: `Sales permanents al núvol (${savedRooms.length})`,
                en: `Permanent cloud rooms (${savedRooms.length})`,
              })}
            </span>
          </div>
          <div className="space-y-1.5 max-h-[168px] overflow-y-auto pr-1">
            {savedRooms.map((sr) => {
              const isCurrent = sr.roomCode.toLowerCase() === roomId.toLowerCase();
              return (
                <div
                  key={sr.roomCode}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    isCurrent
                      ? 'bg-[#9146FF]/15 border-[#9146FF]/45'
                      : 'bg-[#26262C] border-white/[0.08]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!isCurrent) {
                        triggerHaptic('light');
                        onSwitchRoom(sr.roomCode, sr.roomName);
                        onClose();
                      }
                    }}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{sr.roomName}</span>
                      {sr.hasPin && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono truncate">
                      #{sr.roomCode}
                      {sr.queueItems.length > 0
                        ? ` · ${sr.queueItems.length} ${pickLang(lang, {
                            es: 'en cola',
                            ca: 'a la cua',
                            en: 'in queue',
                          })}`
                        : ''}
                    </div>
                  </button>

                  {onDeleteSavedRoom && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onDeleteSavedRoom(sr.roomCode);
                      }}
                      title={pickLang(lang, {
                        es: 'Quitar de salas permanentes',
                        ca: 'Treure de sales permanents',
                        en: 'Remove permanent room',
                      })}
                      aria-label={pickLang(lang, {
                        es: 'Quitar de salas permanentes',
                        ca: 'Treure de sales permanents',
                        en: 'Remove permanent room',
                      })}
                      className="w-8 h-8 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recentRooms.filter((r) => r.id.toLowerCase() !== roomId.toLowerCase()).length > 0 && (
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          <div className="text-[11px] font-medium text-zinc-400">
            {pickLang(lang, {
              es: 'Otras salas recientes',
              ca: 'Altres sales recents',
              en: 'Other recent rooms',
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentRooms
              .filter((r) => r.id.toLowerCase() !== roomId.toLowerCase())
              .slice(0, 5)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSwitchRoom(r.id, r.name);
                    onClose();
                  }}
                  className="h-9 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors bg-[#26262C] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300"
                >
                  <span className="truncate max-w-[130px]">{r.name}</span>
                  <span className="font-mono text-[10px] text-zinc-500">#{r.id}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Scheduled Room Reminder Builder */}
      <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
        <div className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
          <CalendarPlus className="w-3.5 h-3.5 text-[#BF94FF]" />
          <span>
            {pickLang(lang, {
              es: 'Programar sesión en sala',
              ca: 'Programar sessió a la sala',
              en: 'Schedule watch session',
            })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={scheduleTitle}
            onChange={(e) => setScheduleTitle(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'Película o partido hoy...',
              ca: 'Pel·lícula o partit avui...',
              en: 'Movie or match tonight...',
            })}
            className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-[#26262C] border border-white/10 focus:border-[#9146FF] text-xs text-white placeholder:text-zinc-500 outline-none"
          />
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="h-9 px-2 rounded-xl bg-[#26262C] border border-white/10 text-xs text-white outline-none"
          />
          <button
            type="button"
            aria-label={pickLang(lang, {
              es: 'Añadir recordatorio',
              ca: 'Afegir recordatori',
              en: 'Add reminder',
            })}
            onClick={() => {
              if (!scheduleTitle.trim()) return;
              triggerHaptic('success');
              const [hh, mm] = scheduleTime.split(':').map(Number);
              const dt = new Date();
              dt.setHours(Number.isFinite(hh) ? hh : 22, Number.isFinite(mm) ? mm : 0, 0, 0);
              addScheduledRoom({
                roomId,
                roomName: roomName || `Sala ${roomId.toUpperCase()}`,
                title: scheduleTitle.trim(),
                scheduledForIso: dt.toISOString(),
                createdAt: Date.now(),
              });
              setScheduleTitle('');
            }}
            className="h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white cursor-pointer shrink-0"
          >
            +
          </button>
        </div>
        {scheduledRooms.length > 0 && (
          <div className="space-y-1.5">
            {scheduledRooms.slice(0, 3).map((sr) => (
              <div
                key={sr.id}
                className="px-2.5 py-2 rounded-xl bg-[#26262C] border border-white/[0.08] flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-white truncate block">{sr.title}</span>
                  <span className="text-[11px] text-zinc-400">
                    {new Date(sr.scheduledForIso).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · #{sr.roomId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeScheduledRoom(sr.id)}
                  className="p-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                  aria-label={pickLang(lang, {
                    es: 'Eliminar recordatorio',
                    ca: 'Eliminar recordatori',
                    en: 'Delete reminder',
                  })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
