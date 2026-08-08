import { useEffect, useRef } from "react";
import type { FridayState } from "@/hooks/use-friday";

const BARS = 96;

/**
 * Circular spectrum ring wrapped around the core. Bars are driven by a rolling
 * history of the live mic/voice level, so it reads like a radial waveform.
 */
export function SpectrumRing({ state, level }: { state: FridayState; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(0);
  const stateRef = useRef<FridayState>(state);

  levelRef.current = level;
  stateRef.current = state;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;

    const hist = new Float32Array(BARS);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      t += 0.016;
      const st = stateRef.current;
      const lv = Math.min(1, Math.max(0, levelRef.current));
      const active = st !== "idle";

      // shift history and push the newest sample at the head
      hist.copyWithin(1, 0, BARS - 1);
      const base = st === "thinking" ? 0.28 + 0.2 * Math.sin(t * 6) : lv;
      hist[0] = base;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const cx = w / 2;
      const cy = h / 2;
      const r0 = Math.min(w, h) * 0.475;
      const spin = st === "thinking" ? t * 0.9 : t * 0.24;

      for (let i = 0; i < BARS; i++) {
        // mirror the history so the waveform is symmetric left/right
        const idx = i < BARS / 2 ? i : BARS - 1 - i;
        const sample = hist[Math.floor((idx / (BARS / 2)) * (BARS - 1))] ?? 0;
        const idleWave = 0.12 + 0.08 * Math.sin(t * 1.6 + i * 0.35);
        const amp = active ? 0.06 + sample * 0.9 : idleWave;
        const len = Math.min(w, h) * 0.075 * amp * (active ? 1.35 : 1);

        const a = (i / BARS) * Math.PI * 2 + spin;
        const x1 = cx + Math.cos(a) * r0;
        const y1 = cy + Math.sin(a) * r0;
        const x2 = cx + Math.cos(a) * (r0 + len);
        const y2 = cy + Math.sin(a) * (r0 + len);

        const alpha = (active ? 0.35 : 0.2) + amp * 0.5;
        ctx.strokeStyle = `rgba(120, 235, 255, ${Math.min(0.9, alpha).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // thin guide circle
      ctx.strokeStyle = "rgba(120, 235, 255, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r0, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
