import { useEffect, useRef } from "react";

/** Slow drifting depth starfield behind the core. Purely decorative. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.8 + 0.2,
      s: Math.random() * 1.4 + 0.3,
      p: Math.random() * Math.PI * 2,
    }));

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

    let t = 0;
    const draw = () => {
      t += 0.006;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const st of stars) {
        st.y -= 0.00035 * st.z;
        if (st.y < -0.02) st.y = 1.02;
        const twinkle = 0.45 + 0.55 * Math.sin(t * 2 + st.p);
        const alpha = 0.14 + st.z * 0.5 * twinkle;
        ctx.beginPath();
        ctx.fillStyle = `rgba(190, 240, 255, ${alpha.toFixed(3)})`;
        ctx.arc(st.x * w, st.y * h, st.s * st.z, 0, Math.PI * 2);
        ctx.fill();
      }
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
