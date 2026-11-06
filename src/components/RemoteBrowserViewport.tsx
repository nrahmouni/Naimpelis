import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, MonitorPlay } from 'lucide-react';
import { RemoteBrowserInput } from '../types';
import { socketService } from '../services/socket';

interface RemoteBrowserViewportProps {
  isHost: boolean;
  active: boolean;
}

interface RemoteBrowserFrame {
  sequence: number;
  image: string;
}

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

export const RemoteBrowserViewport: React.FC<RemoteBrowserViewportProps> = ({ isHost, active }) => {
  const [frame, setFrame] = useState<RemoteBrowserFrame | null>(null);
  const [error, setError] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFrame(null);
    setError('');
  }, [active]);

  useEffect(() => socketService.subscribe(({ type, payload }) => {
    if (type === 'REMOTE_BROWSER_FRAME' && typeof payload?.image === 'string') {
      setFrame({ sequence: payload.sequence, image: payload.image });
      setError('');
    } else if (type === 'REMOTE_BROWSER_ERROR') {
      setError(payload?.message || 'No se pudo iniciar el navegador remoto.');
    } else if (type === 'REMOTE_BROWSER_STOPPED') {
      setFrame(null);
    }
  }), []);

  const getNormalizedPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scale = Math.min(rect.width / VIEWPORT_WIDTH, rect.height / VIEWPORT_HEIGHT);
    const renderedWidth = VIEWPORT_WIDTH * scale;
    const renderedHeight = VIEWPORT_HEIGHT * scale;
    const left = rect.left + (rect.width - renderedWidth) / 2;
    const top = rect.top + (rect.height - renderedHeight) / 2;
    const x = (clientX - left) / renderedWidth;
    const y = (clientY - top) / renderedHeight;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  const sendInput = (input: RemoteBrowserInput) => socketService.sendRemoteBrowserInput(input);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost) return;
    const point = getNormalizedPoint(event.clientX, event.clientY);
    if (point) sendInput({ kind: 'click', ...point, button: event.button === 2 ? 'right' : 'left' });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isHost) return;
    event.preventDefault();
    const point = getNormalizedPoint(event.clientX, event.clientY);
    if (point) sendInput({ kind: 'wheel', ...point, deltaX: event.deltaX, deltaY: event.deltaY });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isHost) return;
    event.preventDefault();
    if (event.key.length === 1) sendInput({ kind: 'text', text: event.key });
    else sendInput({ kind: 'key', key: event.key });
  };

  return (
    <div
      ref={viewportRef}
      className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#05080a] outline-none ${isHost ? 'cursor-crosshair' : 'cursor-default'}`}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      tabIndex={isHost ? 0 : -1}
      aria-label={isHost ? 'Navegador remoto controlado por el anfitrión' : 'Vista del navegador remoto'}
    >
      {frame ? (
        <img
          key={frame.sequence}
          src={`data:image/jpeg;base64,${frame.image}`}
          alt="Vista compartida del navegador remoto"
          draggable={false}
          className="h-full w-full select-none object-contain"
        />
      ) : error ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-200" />
          <p className="text-sm text-slate-200">{error}</p>
        </div>
      ) : active ? (
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-200" />
          Preparando la sesión remota…
        </div>
      ) : (
        <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-slate-400">
          <MonitorPlay className="h-8 w-8 text-slate-500" />
          <p className="text-sm">El anfitrión iniciará el navegador remoto para esta página.</p>
        </div>
      )}
      {frame && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[11px] text-slate-200 backdrop-blur">
          {isHost ? 'Control remoto activo' : 'Vista sincronizada del anfitrión'}
        </div>
      )}
    </div>
  );
};