import { useEffect, useRef } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Distância mínima em pixels para considerar um swipe (padrão: 50)
}

/**
 * Hook customizado para detectar gestos de swipe em elementos
 * Útil para navegação em tablets e mobile
 * 
 * Uso:
 * const ref = useRef(null);
 * useSwipeGesture(ref, {
 *   onSwipeLeft: () => console.log('Swipe left'),
 *   onSwipeRight: () => console.log('Swipe right'),
 *   threshold: 50
 * });
 * 
 * return <div ref={ref}>...</div>
 */
export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement | null>,
  options: SwipeGestureOptions = {}
) {
  const { 
    onSwipeLeft, 
    onSwipeRight, 
    onSwipeUp, 
    onSwipeDown,
    threshold = 50 
  } = options;

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.changedTouches[0].screenX;
      touchStartY.current = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX.current = e.changedTouches[0].screenX;
      touchEndY.current = e.changedTouches[0].screenY;
      handleSwipe();
    };

    const handleSwipe = () => {
      const deltaX = touchStartX.current - touchEndX.current;
      const deltaY = touchStartY.current - touchEndY.current;

      // Determina se o movimento foi mais horizontal ou vertical
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

      if (isHorizontal && Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // Swipe para esquerda
          onSwipeLeft?.();
        } else {
          // Swipe para direita
          onSwipeRight?.();
        }
      } else if (!isHorizontal && Math.abs(deltaY) > threshold) {
        if (deltaY > 0) {
          // Swipe para cima
          onSwipeUp?.();
        } else {
          // Swipe para baixo
          onSwipeDown?.();
        }
      }
    };

    element.addEventListener('touchstart', handleTouchStart, false);
    element.addEventListener('touchend', handleTouchEnd, false);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart, false);
      element.removeEventListener('touchend', handleTouchEnd, false);
    };
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);
}
