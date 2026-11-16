import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart2,
  Link2,
  ListVideo,
  Lock,
  Play,
  Plus,
  RotateCcw,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import type { AppLanguage, Participant, RoomQueueItem } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { EmptyStateCard, IconButton, SecondaryButton } from '../ui/DesignSystem';
import { PosterImage } from '../ui/PosterImage';

interface PartyQueuePanelProps {
  lang: AppLanguage;
  currentUser: Participant;
  roomQueue: RoomQueueItem[];
  canManageMedia: boolean;
  undoRemovedItem: RoomQueueItem | null;
  onRestoreUndoItem: (item: RoomQueueItem) => void;
  onDeleteQueueItemWithUndo: (item: RoomQueueItem) => void;
  onPlayQueueItem: (item: RoomQueueItem) => void;
  onStartPollFromQueue: () => void;
  onOpenUrlLoaderSheet: () => void;
  onBrowseCatalog?: () => void;
  onVoteQueueItem?: (id: string) => void;
  onPromoteQueueItem?: (id: string) => void;
  onReorderQueueItem?: (id: string, direction: 'up' | 'down') => void;
  onRestoreQueueItem?: (item: RoomQueueItem) => void;
}

export const PartyQueuePanel: React.FC<PartyQueuePanelProps> = ({
  lang,
  currentUser,
  roomQueue,
  canManageMedia,
  undoRemovedItem,
  onRestoreUndoItem,
  onDeleteQueueItemWithUndo,
  onPlayQueueItem,
  onStartPollFromQueue,
  onOpenUrlLoaderSheet,
  onBrowseCatalog,
  onVoteQueueItem,
  onPromoteQueueItem,
  onReorderQueueItem,
  onRestoreQueueItem,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar">
      {/* Action Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-white">
            {pickLang(lang, {
              es: 'Cola de Reproducción',
              ca: 'Cua de Reproducció',
              en: 'Playback Queue',
            })}
          </h4>
          <p className="text-xs text-zinc-400">
            {roomQueue.length}{' '}
            {roomQueue.length === 1
              ? pickLang(lang, {
                  es: 'vídeo en lista',
                  ca: 'vídeo en llista',
                  en: 'video in queue',
                })
              : pickLang(lang, {
                  es: 'vídeos en lista',
                  ca: 'vídeos en llista',
                  en: 'videos in queue',
                })}
          </p>
        </div>
        {canManageMedia && (
          <div className="flex items-center gap-2 shrink-0">
            {roomQueue.length >= 2 && (
              <SecondaryButton onClick={onStartPollFromQueue}>
                <BarChart2 className="w-4 h-4 text-[#BF94FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'Votar Cola',
                    ca: 'Votar Cua',
                    en: 'Vote Queue',
                  })}
                </span>
              </SecondaryButton>
            )}

            {roomQueue.length > 0 && (
              <SecondaryButton onClick={onOpenUrlLoaderSheet}>
                <Link2 className="w-4 h-4 text-sky-400" />
                <span>
                  {pickLang(lang, { es: 'Enlace', ca: 'Enllaç', en: 'Link' })}
                </span>
              </SecondaryButton>
            )}

            {onBrowseCatalog && (
              <SecondaryButton onClick={onBrowseCatalog}>
                <Plus className="w-4 h-4 text-[#BF94FF]" />
                <span>
                  {pickLang(lang, { es: 'Catálogo', ca: 'Catàleg', en: 'Catalog' })}
                </span>
              </SecondaryButton>
            )}
          </div>
        )}
      </div>

      {!canManageMedia && (
        <div className="px-3 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {pickLang(lang, {
              es: 'Solo el Anfitrión o un Co-anfitrión puede cambiar de película o canal. Puedes votar los títulos en cola.',
              ca: 'Només l’Amfitrió o un Co-amfitrió pot canviar de pel·lícula o canal. Pots votar els títols a la cua.',
              en: 'Only the Host or a Co-host can change movies or channels. You can vote on queued items.',
            })}
          </span>
        </div>
      )}

      {roomQueue.length === 0 ? (
        <EmptyStateCard
          icon={<ListVideo className="w-6 h-6" />}
          title={pickLang(lang, {
            es: 'La cola está vacía',
            ca: 'La cua és buida',
            en: 'Queue is empty',
          })}
          description={
            canManageMedia
              ? pickLang(lang, {
                  es: 'Añade películas, episodios o vídeos desde el catálogo con el botón + Cola, o abre un enlace directo.',
                  ca: 'Afegeix pel·lícules, episodis o vídeos des del catàleg amb el botó + Cua, o obre un enllaç directe.',
                  en: 'Add movies, episodes, or videos from the catalog with + Queue, or open a direct link.',
                })
              : pickLang(lang, {
                  es: 'Puedes sugerir películas o vídeos a la cola con el botón + Cola para que el Anfitrión los ponga.',
                  ca: 'Pots suggerir pel·lícules o vídeos a la cua amb el botó + Cua perquè l’Amfitrió els posi.',
                  en: 'Suggest movies or videos to the queue with + Queue for the Host to play.',
                })
          }
          actionLabel={
            canManageMedia
              ? pickLang(lang, {
                  es: 'Pegar enlace o abrir web',
                  ca: 'Enganxar enllaç o obrir web',
                  en: 'Paste link or open web',
                })
              : undefined
          }
          onAction={canManageMedia ? onOpenUrlLoaderSheet : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {undoRemovedItem && onRestoreQueueItem && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-between gap-2">
              <span className="text-xs text-amber-100 truncate">
                {pickLang(lang, {
                  es: `Quitado "${undoRemovedItem.title}"`,
                  ca: `Tret "${undoRemovedItem.title}"`,
                  en: `Removed "${undoRemovedItem.title}"`,
                })}
              </span>
              <button
                type="button"
                onClick={() => onRestoreUndoItem(undoRemovedItem)}
                className="px-2.5 py-1 rounded-lg bg-amber-400 text-[#140E02] text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{pickLang(lang, { es: 'Deshacer', ca: 'Desfer', en: 'Undo' })}</span>
              </button>
            </div>
          )}

          {roomQueue.map((item, idx) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] p-2.5 flex items-center gap-3 transition-all"
            >
              <div className="relative w-20 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
                <PosterImage
                  src={item.poster}
                  alt={item.title}
                  aspect="none"
                  className="w-full h-full"
                  fallbackIcon={
                    <span className="text-xs font-mono text-zinc-500">#{idx + 1}</span>
                  }
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent flex items-end p-1.5 pointer-events-none">
                  <span className="text-[0.65rem] font-mono font-bold text-white">
                    #{idx + 1}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {item.title}
                </div>
                <div className="text-xs text-zinc-400 truncate mt-0.5">
                  {pickLang(lang, {
                    es: `Añadido por ${item.addedBy}`,
                    ca: `Afegit per ${item.addedBy}`,
                    en: `Added by ${item.addedBy}`,
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onVoteQueueItem && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onVoteQueueItem(item.id);
                    }}
                    title={pickLang(lang, {
                      es: 'Votar este título en la cola',
                      ca: 'Votar aquest títol a la cua',
                      en: 'Vote for this title in queue',
                    })}
                    aria-label={pickLang(lang, {
                      es: 'Votar este título en la cola',
                      ca: 'Votar aquest títol a la cua',
                      en: 'Vote for this title in queue',
                    })}
                    className={`min-h-9 px-2 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      item.voterIds?.includes(currentUser.id)
                        ? 'bg-[#9146FF]/25 border border-[#9146FF]/55 text-[#BF94FF]'
                        : 'bg-[#26262C] hover:bg-white/[0.12] text-[#EFEFF1]'
                    }`}
                  >
                    <ThumbsUp className="w-3 h-3" />
                    <span>{item.voterIds?.length || 0}</span>
                  </button>
                )}
                {canManageMedia && (
                  <>
                    {onReorderQueueItem && roomQueue.length > 1 && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            triggerHaptic('light');
                            onReorderQueueItem(item.id, 'up');
                          }}
                          aria-label={pickLang(lang, { es: 'Subir en la cola', ca: 'Pujar a la cua', en: 'Move up' })}
                          className="w-7 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center text-zinc-300 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === roomQueue.length - 1}
                          onClick={() => {
                            triggerHaptic('light');
                            onReorderQueueItem(item.id, 'down');
                          }}
                          aria-label={pickLang(lang, { es: 'Bajar en la cola', ca: 'Baixar a la cua', en: 'Move down' })}
                          className="w-7 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center text-zinc-300 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {idx > 0 && onPromoteQueueItem && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onPromoteQueueItem(item.id);
                        }}
                        title={pickLang(lang, {
                          es: 'Poner siguiente en reproducirse',
                          ca: 'Posar següent a reproduir-se',
                          en: 'Move to play next',
                        })}
                        aria-label={pickLang(lang, {
                          es: 'Poner siguiente en reproducirse',
                          ca: 'Posar següent a reproduir-se',
                          en: 'Move to play next',
                        })}
                        className="min-h-8 px-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-bold text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>↑ #1</span>
                      </button>
                    )}
                    <IconButton
                      onClick={() => onPlayQueueItem(item)}
                      variant="crimson"
                      title={pickLang(lang, {
                        es: 'Reproducir ahora',
                        ca: 'Reproduir ara',
                        en: 'Play now',
                      })}
                      aria-label={pickLang(lang, {
                        es: 'Reproducir ahora',
                        ca: 'Reproduir ara',
                        en: 'Play now',
                      })}
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </IconButton>
                    <IconButton
                      onClick={() => onDeleteQueueItemWithUndo(item)}
                      variant="ghost"
                      title={pickLang(lang, {
                        es: 'Quitar de la cola',
                        ca: 'Treure de la cua',
                        en: 'Remove from queue',
                      })}
                      aria-label={pickLang(lang, {
                        es: 'Quitar de la cola',
                        ca: 'Treure de la cua',
                        en: 'Remove from queue',
                      })}
                    >
                      <Trash2 className="w-4 h-4 text-zinc-400 hover:text-rose-400" />
                    </IconButton>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
