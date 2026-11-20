import { useEffect, useRef } from 'react';

export function useGlobalEscape(onEscape: () => void, enabled = true) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);
}
