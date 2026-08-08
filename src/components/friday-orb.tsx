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
    const edges = makeEdges(points);
    const proj = points.map(() => ({ x: 0, y: 0, d: 0, z: 0 }));
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
      const base = Math.min(width, height) * 0.42;
      const radius = base * (1 + smoothed * 0.26 + Math.sin(time * 1.1) * 0.02);

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      // outer atmosphere
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2);
      glow.addColorStop(0, `rgba(180, 230, 255, ${0.22 + smoothed * 0.3})`);
      glow.addColorStop(0.4, "rgba(110, 185, 230, 0.07)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 2, 0, Math.PI * 2);
      ctx.fill();

      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      // project every node
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const wob = p.r * (1 + Math.sin(time * 1.5 + p.seed) * (0.05 + smoothed * 0.18));

        let x = p.x * cosR + p.z * sinR;
        let z = -p.x * sinR + p.z * cosR;
        const y = p.y * cosT - z * sinT;
        z = p.y * sinT + z * cosT;

        const depth = 1.9 / (2.6 - z);
        const q = proj[i]!;
        q.x = cx + x * radius * wob * depth;
        q.y = cy + y * radius * wob * depth;
        q.d = depth;
        q.z = z;
      }

      // filament network between neighbouring nodes
      ctx.lineCap = "round";
      for (const [i, j] of edges) {
        const a = proj[i]!;
        const b = proj[j]!;
        const zf = Math.max(0, ((a.z + b.z) / 2 + 1) / 2);
        const alpha = (0.05 + zf * zf * 0.3) * (0.75 + smoothed * 0.9);
        ctx.strokeStyle = `rgba(206, 240, 255, ${alpha})`;
        ctx.lineWidth = 0.35 + zf * 0.55;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // node particles
      for (let i = 0; i < proj.length; i++) {
        const q = proj[i]!;
        const zf = Math.max(0, (q.z + 1) / 2);
        ctx.fillStyle = `rgba(232, 250, 255, ${0.1 + zf * zf * 0.55})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(0.3, 0.85 * q.d), 0, Math.PI * 2);
        ctx.fill();
      }

      // bright nucleus
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.55);
      core.addColorStop(0, `rgba(255,255,255,${0.9 + smoothed * 0.1})`);
      core.addColorStop(0.25, "rgba(215, 245, 255, 0.45)");
      core.addColorStop(1, "rgba(150, 210, 255, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";


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
