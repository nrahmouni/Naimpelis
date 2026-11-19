import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useSuppressFloatingBubble(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useAppStore.getState().pushBubbleSuppression();
    return () => {
      useAppStore.getState().popBubbleSuppression();
    };
  }, [active]);
}
