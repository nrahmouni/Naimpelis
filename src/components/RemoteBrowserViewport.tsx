import React from 'react';

export interface RemoteBrowserViewportProps {
  isHost: boolean;
  active: boolean;
  frameUrl?: string;
}

export const RemoteBrowserViewport: React.FC<RemoteBrowserViewportProps> = ({
  isHost,
  active,
  frameUrl,
}) => {
  if (!active) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-400">
        <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-200">Iniciando sesión del navegador remoto...</p>
        <p className="mt-1 text-xs text-slate-500">
          {isHost ? 'Conectando contenedor de navegación.' : 'Esperando transmisión del anfitrión.'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black overflow-hidden flex items-center justify-center">
      {frameUrl ? (
        <img
          src={frameUrl}
          alt="Transmisión del navegador remoto"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center text-slate-400">
          <p className="text-sm font-medium">Navegador remoto activo</p>
          <p className="text-xs text-slate-500">
            {isHost ? 'Interactúa con los controles para navegar.' : 'Viendo pantalla sincronizada del anfitrión.'}
          </p>
        </div>
      )}
    </div>
  );
};
