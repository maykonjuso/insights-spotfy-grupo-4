"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Contagem crescente em requestAnimationFrame: um unico rAF por valor, sem
// biblioteca de animacao. Quem pede menos movimento recebe o numero direto.
export function useAnimatedNumber(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const frame = useRef(0);
  const from = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0) {
      from.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = target - origin;

    if (delta === 0) return;

    function step(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const current = origin + delta * eased;
      setValue(current);
      from.current = current;
      if (progress < 1) frame.current = requestAnimationFrame(step);
    }

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}
