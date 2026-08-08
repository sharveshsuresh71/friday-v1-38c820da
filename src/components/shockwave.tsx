import { useEffect, useRef, useState } from "react";
import type { FridayState } from "@/hooks/use-friday";

/** Emits an expanding shockwave ring each time FRIDAY starts speaking. */
export function Shockwave({ state }: { state: FridayState }) {
  const [waves, setWaves] = useState<number[]>([]);
  const prev = useRef<FridayState>(state);

  useEffect(() => {
    if (state === "speaking" && prev.current !== "speaking") {
      const id = Date.now();
      setWaves((w) => [...w, id]);
      window.setTimeout(() => setWaves((w) => w.filter((x) => x !== id)), 1400);
    }
    prev.current = state;
  }, [state]);

  return (
    <>
      {waves.map((id) => (
        <span
          key={id}
          aria-hidden
          className="animate-shockwave pointer-events-none absolute inset-0 rounded-full border border-primary/50"
        />
      ))}
    </>
  );
}
