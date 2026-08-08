import { useEffect, useState } from "react";

const LINES = [
  "initialising neural core",
  "linking voice pipeline",
  "calibrating microphone array",
  "loading conversation memory",
  "friday online",
];

/** One-time HUD boot sequence overlay shown on first paint. */
export function BootSequence() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("friday-booted")) {
      setDone(true);
      return;
    }
    const timers: number[] = [];
    LINES.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStep(i + 1), 260 * (i + 1)));
    });
    timers.push(
      window.setTimeout(() => {
        sessionStorage.setItem("friday-booted", "1");
        setDone(true);
      }, 260 * LINES.length + 700),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  if (done) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background transition-opacity duration-500">
      <div className="relative h-24 w-24">
        <span className="absolute inset-0 animate-ping rounded-full border border-primary/40" />
        <span className="absolute inset-3 rounded-full bg-primary/20 blur-xl" />
        <span className="absolute inset-[38%] rounded-full bg-primary" />
      </div>
      <div className="w-[min(80vw,20rem)] space-y-1.5 font-mono text-[11px] tracking-[0.14em] uppercase">
        {LINES.slice(0, step).map((line) => (
          <p key={line} className="animate-rise text-muted-foreground">
            <span className="text-primary">›</span> {line}
          </p>
        ))}
      </div>
      <div className="h-px w-[min(80vw,20rem)] overflow-hidden bg-border">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${(step / LINES.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
