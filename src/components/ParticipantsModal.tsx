import React from 'react';
import { Users, Crown, ShieldAlert, X } from 'lucide-react';
import { Participant } from '../types';

interface ParticipantsModalProps {
  participants: Participant[];
  currentUser: Participant;
  hostId: string;
  onTransferHost: (newHostId: string) => void;
  onClose: () => void;
}

export const ParticipantsModal: React.FC<ParticipantsModalProps> = ({
  participants,
  currentUser,
  hostId,
  onTransferHost,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">Participantes ({participants.length})</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {participants.map((p) => {
            const isMe = p.id === currentUser.id;
            const isHost = p.id === hostId || p.isHost;

            return (
              <div
                key={p.id}
                className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 border border-white/10"
                    style={{ backgroundColor: p.color || '#3b82f6' }}
                  >
                    {p.avatar || '🍿'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-100 truncate flex items-center gap-1">
                      <span>{p.name}</span>
                      {isMe && <span className="text-[10px] text-slate-500 font-normal">(Tú)</span>}
                    </p>
                    {isHost && (
                      <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                        <Crown className="w-3 h-3" /> Anfitrión
                      </span>
                    )}
                  </div>
                </div>

                {currentUser.isHost && !isMe && (
                  <button
                    onClick={() => onTransferHost(p.id)}
                    className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0"
                  >
                    Hacer Host
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
