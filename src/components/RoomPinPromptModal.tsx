import React, { useEffect, useRef, useState } from 'react';
import { Lock, ArrowRight, LogOut, AlertCircle } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface RoomPinPromptModalProps {
  isOpen: boolean;
  roomName: string;
  roomCode: string;
  invalidAttempt: boolean;
  lang: AppLanguage;
  onSubmitPin: (pin: string) => void;
  onLeaveProtectedRoom: () => void;
}

export const RoomPinPromptModal: React.FC<RoomPinPromptModalProps> = ({
  isOpen,
  roomName,
  roomCode,
  invalidAttempt,
  lang,
  onSubmitPin,
  onLeaveProtectedRoom,
}) => {
  const [pin, setPin] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, invalidAttempt]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[0-9]{4}$/.test(pin)) return;
    triggerHaptic('medium');
    onSubmitPin(pin);
  };

  const handlePinChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 4);
    setPin(digitsOnly);
    if (digitsOnly.length === 4) {
      triggerHaptic('success');
      onSubmitPin(digitsOnly);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#0B0B0E]/92 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="w-full max-w-[390px] rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border border-white/12 shadow-[0_30px_100px_rgba(0,0,0,0.92)] p-6 space-y-5 animate-sheet-up">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/40 flex items-center justify-center text-[#BF94FF]">
            <Lock className="w-6 h-6" />
          </div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
            {lang === 'es' ? 'Sala Privada Protegida' : 'PIN-Protected Private Room'}
          </div>
          <h2 className="font-display font-bold text-xl text-white">
            {roomName || `Sala #${roomCode.toUpperCase()}`}
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {lang === 'es'
              ? 'Introduce el PIN de 4 dígitos configurado por el anfitrión para desbloquear y entrar a la proyección.'
              : 'Enter the 4-digit PIN set by the host to unlock and join this screening room.'}
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="• • • •"
              aria-label={lang === 'es' ? 'PIN de 4 dígitos' : '4-digit PIN'}
              className={`w-full h-14 px-4 rounded-2xl bg-white/[0.045] focus:bg-white/[0.075] border ${
                invalidAttempt
                  ? 'border-[#EB0400] focus:border-[#EB0400]'
                  : 'border-white/15 focus:border-[#9146FF]'
              } text-center font-mono font-bold text-2xl tracking-[0.55em] text-white placeholder:text-zinc-600 outline-none transition-all`}
            />
          </div>

          {invalidAttempt && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                {lang === 'es'
                  ? 'PIN incorrecto. Verifica los 4 dígitos con el anfitrión.'
                  : 'Incorrect PIN. Check the 4 digits with the room host.'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onLeaveProtectedRoom}
              className="h-12 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'es' ? 'Salir' : 'Leave'}</span>
            </button>

            <button
              type="submit"
              disabled={pin.length !== 4}
              className="h-12 px-4 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 disabled:opacity-40 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-all shadow-[0_8px_24px_rgba(145,70,255,0.34)]"
            >
              <span>{lang === 'es' ? 'Desbloquear' : 'Unlock'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
