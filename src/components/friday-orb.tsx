import { useEffect, useRef } from "react";
import type { FridayState } from "@/hooks/use-friday";

type Point = { x: number; y: number; z: number; seed: number; r: number };

const COUNT = 1100;
const NEIGHBORS = 3;

function makePoints(): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < COUNT; i++) {
    // Fibonacci sphere for even distribution
    const t = (i + 0.5) / COUNT;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    pts.push({
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.sin(phi) * Math.sin(theta),
      z: Math.cos(phi),
      seed: Math.random() * Math.PI * 2,
      // slight shell thickness so the mesh reads as an organic filament web
      r: 0.86 + Math.random() * 0.14,
    });
  }
  return pts;
}

/** Link each node to its nearest neighbours to form the filament network. */
function makeEdges(pts: Point[]): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const best: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const b = pts[j]!;
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
      if (best.length < NEIGHBORS) {
        best.push({ j, d });
        best.sort((m, n) => m.d - n.d);
      } else if (d < best[best.length - 1]!.d) {
        best[best.length - 1] = { j, d };
        best.sort((m, n) => m.d - n.d);
      }
    }
    for (const { j } of best) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }
  return edges;
}


/**
 * Animated pseudo-3D particle core: a rotating sphere of filaments that
 * breathes while idle, expands with the mic level, and swirls while thinking.
 */
export function FridayOrb({ state, level }: { state: FridayState; level: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);

  stateRef.current = state;
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points = makePoints();
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let smoothed = 0;
    let rot = 0;
    let tilt = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      const s = stateRef.current;
      const target = s === "listening" ? levelRef.current : s === "speaking" ? 0.55 : 0.12;
      smoothed += (target - smoothed) * 0.12;

      const spin = s === "thinking" ? 0.9 : 0.22 + smoothed * 0.5;
      rot += spin * 0.016;
      tilt = Math.sin(time * 0.25) * 0.5;

      const cx = width / 2;
      const cy = height / 2;
      const base = Math.min(width, height) * 0.34;
      const radius = base * (1 + smoothed * 0.28 + Math.sin(time * 1.1) * 0.02);

      ctx.clearRect(0, 0, width, height);

      // core glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.9);
      glow.addColorStop(0, `rgba(190, 235, 255, ${0.28 + smoothed * 0.35})`);
      glow.addColorStop(0.35, "rgba(120, 190, 230, 0.10)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.9, 0, Math.PI * 2);
      ctx.fill();

      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      for (const p of points) {
        // wobble each filament outward
        const wob = 1 + Math.sin(time * 1.6 + p.seed) * (0.06 + smoothed * 0.22);

        // rotate Y then X
        let x = p.x * cosR + p.z * sinR;
        let z = -p.x * sinR + p.z * cosR;
        let y = p.y * cosT - z * sinT;
        z = p.y * sinT + z * cosT;

        const depth = 1.9 / (2.6 - z);
        const px = cx + x * radius * wob * depth;
        const py = cy + y * radius * wob * depth;

        // trailing filament toward the core
        const inner = 0.35 + smoothed * 0.2;
        const ix = cx + x * radius * inner * depth;
        const iy = cy + y * radius * inner * depth;

        const alpha = Math.max(0, (z + 1) / 2) * (0.16 + smoothed * 0.3);
        ctx.strokeStyle = `rgba(200, 240, 255, ${alpha})`;
        ctx.lineWidth = 0.6 * depth;
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = `rgba(225, 248, 255, ${alpha * 1.6})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, 1.1 * depth), 0, Math.PI * 2);
        ctx.fill();
      }

      // bright nucleus
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.3);
      core.addColorStop(0, `rgba(255,255,255,${0.85 + smoothed * 0.15})`);
      core.addColorStop(1, "rgba(180, 225, 255, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-full w-full"
      style={{ display: "block" }}
    />
  );
}
