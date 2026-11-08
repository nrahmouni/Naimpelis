import React from 'react';
import { Users, Crown, Shield, X, Check } from 'lucide-react';
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">Usuarios en la Sala ({participants.length})</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {participants.map((p) => {
            const isMe = p.id === currentUser.id;
            const isHost = p.id === hostId;

            return (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800/80"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm shadow-md border border-slate-800"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200">
                        {p.name} {isMe && '(Tú)'}
                      </span>
                      {isHost && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
                          <Crown className="w-2.5 h-2.5" /> Host
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">Conectado en directo</span>
                  </div>
                </div>

                {currentUser.isHost && !isHost && (
                  <button
                    onClick={() => onTransferHost(p.id)}
                    className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-amber-500/20 hover:text-amber-400 text-slate-400 text-[10px] font-semibold border border-slate-700 transition-colors"
                  >
                    Dar Host
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
