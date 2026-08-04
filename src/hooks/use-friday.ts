import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startListening, type Listener } from "@/lib/voice-listener";

export type Turn = { role: "user" | "assistant"; content: string; at: number };
export type FridayState = "idle" | "listening" | "thinking" | "speaking";

const STORAGE_KEY = "friday.conversation.v1";

function loadTurns(): Turn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Turn =>
        !!t &&
        typeof (t as Turn).content === "string" &&
        ((t as Turn).role === "user" || (t as Turn).role === "assistant"),
    );
  } catch {
    return [];
  }
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (res.status === 429) return "Too many requests right now — give it a moment.";
  if (res.status === 402) return "AI credits are used up. Add credits to keep talking.";
  if (res.status === 403 || res.status === 404) return "AI voice features aren't enabled here.";
  return body.slice(0, 180) || `Something went wrong (${res.status}).`;
}

export function useFriday() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<FridayState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const listenerRef = useRef<Listener | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const busyRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const handleUtteranceRef = useRef<((wav: Blob) => Promise<void>) | null>(null);

  useEffect(() => {
    setTurns(loadTurns());
  }, []);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const persist = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-100)));
    } catch {
      /* storage full or unavailable — conversation still works in memory */
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    const res = await fetch("/api/friday/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await readError(res));

    const url = URL.createObjectURL(await res.blob());
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    setState("speaking");
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  }, []);

  const handleUtterance = useCallback(
    async (wav: Blob) => {
      if (busyRef.current) return;
      busyRef.current = true;
      listenerRef.current?.setPaused(true);
      setError(null);
      setState("thinking");

      try {
        const form = new FormData();
        form.append("audio", wav, "recording.wav");
        const sttRes = await fetch("/api/friday/transcribe", { method: "POST", body: form });
        if (!sttRes.ok) throw new Error(await readError(sttRes));
        const { text } = (await sttRes.json()) as { text: string };
        if (!text) {
          setState("listening");
          return;
        }

        const withUser: Turn[] = [
          ...turnsRef.current,
          { role: "user", content: text, at: Date.now() },
        ];
        persist(withUser);

        const replyRes = await fetch("/api/friday/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: withUser.map(({ role, content }) => ({ role, content })),
          }),
        });
        if (!replyRes.ok) throw new Error(await readError(replyRes));
        const { text: reply } = (await replyRes.json()) as { text: string };

        persist([...withUser, { role: "assistant", content: reply, at: Date.now() }]);
        await speak(reply);
        setState("listening");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setState("listening");
      } finally {
        busyRef.current = false;
        const listener = listenerRef.current;
        if (listener) {
          listener.setPaused(false);
          await listener.resume();
          // Chrome (esp. Android) can tear down the mic graph during playback —
          // rebuild it so the session keeps running for unlimited turns.
          if (!listener.isAlive()) {
            listener.stop();
            listenerRef.current = null;
            try {
              listenerRef.current = await startListening({
                onLevel: setLevel,
                onUtterance: (wav) => void handleUtteranceRef.current?.(wav),
              });
              setState("listening");
            } catch {
              setError("Microphone stopped. Tap start to continue.");
              setLive(false);
              setState("idle");
            }
          }
        }
      }
    },
    [persist, speak],
  );

  useEffect(() => {
    handleUtteranceRef.current = handleUtterance;
  }, [handleUtterance]);

  const stop = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    audioRef.current?.pause();
    busyRef.current = false;
    setLive(false);
    setLevel(0);
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      // Unlock audio playback inside the user gesture (required on Android/iOS).
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;

      listenerRef.current = await startListening({
        onLevel: setLevel,
        onUtterance: (wav) => void handleUtterance(wav),
      });
      setLive(true);
      setState("listening");
    } catch {
      setError("Microphone access is needed. Allow it in your browser settings and try again.");
      setState("idle");
    }
  }, [handleUtterance]);

  const clear = useCallback(() => {
    persist([]);
    setError(null);
  }, [persist]);

  useEffect(() => () => listenerRef.current?.stop(), []);

  const lastReply = useMemo(
    () => [...turns].reverse().find((t) => t.role === "assistant")?.content ?? null,
    [turns],
  );
  const lastAsk = useMemo(
    () => [...turns].reverse().find((t) => t.role === "user")?.content ?? null,
    [turns],
  );

  return { turns, state, level, error, live, start, stop, clear, lastReply, lastAsk };
}
