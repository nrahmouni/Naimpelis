import React from 'react';
import { motion } from 'motion/react';
import { BarChart2 } from 'lucide-react';
import type { AppLanguage, Participant, RoomPollState } from '../../types';
import { pickLang } from '../../utils/i18n';

interface PartyPollCardProps {
  activePoll: RoomPollState;
  currentUser: Participant;
  lang: AppLanguage;
  canManageMedia: boolean;
  onVotePoll: (pollId: string, optionId: string) => void;
  onClosePoll: (pollId: string) => void;
}

export const PartyPollCard: React.FC<PartyPollCardProps> = ({
  activePoll,
  currentUser,
  lang,
  canManageMedia,
  onVotePoll,
  onClosePoll,
}) => {
  const totalVotes = activePoll.options.reduce((acc, o) => acc + o.voterIds.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-3 mt-2.5 p-3.5 rounded-2xl nc-specular-surface border border-[#9146FF]/40 space-y-2.5 shrink-0 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
          <BarChart2 className="w-3.5 h-3.5" />
          <span>
            {pickLang(lang, {
              es: 'Encuesta en Vivo',
              ca: 'Enquesta en Directe',
              en: 'Live Poll',
            })}
          </span>
        </div>
        {canManageMedia && (
          <button
            type="button"
            onClick={() => onClosePoll(activePoll.id)}
            className="text-xs text-[#ADADB8] hover:text-white cursor-pointer"
          >
            {pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
          </button>
        )}
      </div>
      <p className="text-xs font-bold text-white">{activePoll.question}</p>
      <div className="space-y-1.5">
        {activePoll.options.map((opt) => {
          const votes = opt.voterIds.length;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const voted = opt.voterIds.includes(currentUser.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onVotePoll(activePoll.id, opt.id)}
              className={`w-full relative overflow-hidden rounded-xl border px-3 py-2 text-left transition-all cursor-pointer ${
                voted
                  ? 'border-[#9146FF]/65 bg-[#9146FF]/20'
                  : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]'
              }`}
            >
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.max(0, pct / 100) }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                className="absolute inset-y-0 left-0 w-full origin-left bg-[#9146FF]/30"
              />
              <div className="relative flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-white truncate">
                  {opt.item.title}
                </span>
                <span className="text-xs font-mono text-zinc-300 tabular-nums shrink-0">
                  {pct}% ({votes})
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};
