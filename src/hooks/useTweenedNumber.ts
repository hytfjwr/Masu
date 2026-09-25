import { useEffect, useState } from 'react';

interface Tween {
  from: number | null;
  to: number | null;
  value: number | null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

function isAnimatable(t: Tween): boolean {
  return t.from !== null && t.to !== null && t.from !== t.to && !prefersReducedMotion();
}

/** The value currently on screen for a tween (a non-animatable tween shows its target right away). */
function shownValue(t: Tween): number | null {
  return isAnimatable(t) ? t.value : t.to;
}

/**
 * Animate a displayed number toward `target` (ease-out cubic). A change mid-tween continues from the
 * value on screen; null (no value) and reduced motion switch instantly.
 */
export function useTweenedNumber(target: number | null, durationMs = 400): { value: number | null; tweening: boolean } {
  const [tween, setTween] = useState<Tween>({ from: target, to: target, value: target });
  // New target: restart from whatever is on screen right now (render-phase update, no flash of the target)
  if (tween.to !== target) {
    const current = shownValue(tween);
    setTween({ from: current, to: target, value: current });
  }

  const animatable = isAnimatable(tween);
  const { from, to } = tween;

  // useEffect required: requestAnimationFrame loop driving the tween
  useEffect(() => {
    if (!animatable || from === null || to === null) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setTween(prev => (prev.to === to ? { ...prev, value: from + (to - from) * eased } : prev));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animatable, from, to, durationMs]);

  const value = shownValue(tween);
  return { value, tweening: animatable && value !== to };
}
