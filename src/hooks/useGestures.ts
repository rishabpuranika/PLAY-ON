
/**
 * useGestures hook
 * 
 * Detects:
 * - Swipe Right
 * - Swipe Left
 * - Double Tap
 * 
 * Returns raw gesture events. Mapping to actions happens in the consumer.
 */

import { useEffect, useCallback, useRef } from 'react';

interface GestureCallbacks {
    onSwipeRight?: () => void;
    onSwipeLeft?: () => void;
    onTwoFingerTap?: () => void;
}

const MIN_SWIPE_DISTANCE = 50; // px
const MAX_SWIPE_TIME = 500; // ms

export function useGestures(elementRef: React.RefObject<HTMLElement>, callbacks: GestureCallbacks) {
    const touchStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
    const callbacksRef = useRef(callbacks);

    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (e.touches.length === 1) {
            touchStartRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: Date.now()
            };
        }
        else if (e.touches.length === 2) {
            // Potential two-finger tap start
        }
    }, []);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (!touchStartRef.current) return;

        // If swipe end (touches 0)
        if (e.changedTouches.length === 1) {
            const start = touchStartRef.current;
            const end = {
                x: e.changedTouches[0].clientX,
                y: e.changedTouches[0].clientY,
                time: Date.now()
            };

            const diffX = end.x - start.x;
            const diffY = end.y - start.y;
            const duration = end.time - start.time;

            if (duration < MAX_SWIPE_TIME) {
                // Horizontal Swipe Check
                if (Math.abs(diffX) > MIN_SWIPE_DISTANCE && Math.abs(diffY) < 100) {
                    // Prevent scrolling if it looks horizontal enough? 
                    // Actually better to just detect
                    if (diffX > 0) {
                        // Right Swipe
                        console.log("Swipe Right Detect");
                        callbacksRef.current.onSwipeRight?.();
                    } else {
                        // Left Swipe
                        console.log("Swipe Left Detect");
                        callbacksRef.current.onSwipeLeft?.();
                    }
                }
            }
        }
        touchStartRef.current = null;
    }, []);

    useEffect(() => {
        const element = elementRef.current || document.body;

        // Passive listeners are better for scrolling perfs, but we might want to capture
        // For now, let's use passive
        element.addEventListener('touchstart', handleTouchStart as any, { passive: true });
        element.addEventListener('touchend', handleTouchEnd as any, { passive: true });

        return () => {
            element.removeEventListener('touchstart', handleTouchStart as any);
            element.removeEventListener('touchend', handleTouchEnd as any);
        };
    }, [handleTouchStart, handleTouchEnd, elementRef]);
}
