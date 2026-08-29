import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Turn = { role: "user" | "assistant"; content: string; at: number };
export type FridayState = "idle" | "listening" | "thinking" | "speaking";

const STORAGE_KEY = "friday.conversation.v1";

// --- Web Speech API types (not in default TS lib) ---
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const busyRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const pulseRef = useRef<number | null>(null);

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

  // Voices list loads asynchronously in most browsers — this waits for it
  // instead of racing an empty array on the very first speak() call.
  const getVoicesReady = useCallback((): Promise<SpeechSynthesisVoice[]> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve([]);
        return;
      }
      const existing = window.speechSynthesis.getVoices();
      if (existing.length > 0) {
        resolve(existing);
        return;
      }
      const onVoices = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      // Fallback in case the event never fires on this browser.
      setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
    });
  }, []);

  // Names of common female system voices across Windows, macOS/iOS, Android, and Chrome.
  const FEMALE_VOICE_HINTS =
    /female|samantha|victoria|karen|moira|tessa|fiona|susan|zira|jenny|aria|libby|olivia|salli|joanna|ivy|kendra|kimberly|amy|emma|google uk english female|google us english/i;

  // Free TTS via the browser's built-in voice — no server call, no key.
  const speak = useCallback(
    async (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      setState("speaking");

      const voices = await getVoicesReady();
      const enVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
      const warm =
        enVoices.find((v) => FEMALE_VOICE_HINTS.test(v.name)) ??
        voices.find((v) => FEMALE_VOICE_HINTS.test(v.name)) ??
        enVoices[0];

      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1;
        utter.pitch = 1;
        if (warm) utter.voice = warm;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      });
    },
    [getVoicesReady],
  );

  const handleTranscript = useCallback(
    async (text: string) => {
      if (!text.trim() || busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setState("thinking");

      try {
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
        setState(recognitionRef.current ? "listening" : "idle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setState(recognitionRef.current ? "listening" : "idle");
      } finally {
        busyRef.current = false;
      }
    },
    [persist, speak],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (pulseRef.current) cancelAnimationFrame(pulseRef.current);
    busyRef.current = false;
    setLive(false);
    setLevel(0);
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError(
        "Free voice recognition needs Chrome, Edge, or Safari — this browser doesn't support it.",
      );
      return;
    }

    try {
      // Ask for mic permission up front so the error message is clear if denied.
      await navigator.mediaDevices?.getUserMedia({ audio: true });
    } catch {
      setError("Microphone is blocked for this app. Allow mic access in your browser settings.");
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (ev) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r?.isFinal) finalText += r[0].transcript;
      }
      if (finalText.trim()) void handleTranscript(finalText.trim());
    };

    recognition.onerror = (ev) => {
      const err = (ev as Event & { error?: string }).error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setError("Microphone is blocked. Allow mic access and try again.");
        setLive(false);
        setState("idle");
      }
      // "no-speech" / "aborted" are routine — recognition auto-restarts via onend.
    };

    recognition.onend = () => {
      // Browsers stop recognition after a period of silence — restart to stay "always on".
      if (recognitionRef.current === recognition && live) {
        try {
          recognition.start();
        } catch {
          /* already starting */
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setLive(true);
    setState("listening");

    // Simple pulsing level so the UI still has motion (Web Speech API gives no real levels).
    const pulse = () => {
      setLevel((v) => (state === "listening" ? 0.3 + 0.2 * Math.sin(Date.now() / 300) : v));
      pulseRef.current = requestAnimationFrame(pulse);
    };
    pulseRef.current = requestAnimationFrame(pulse);
  }, [handleTranscript, live, state]);

  const clear = useCallback(() => {
    persist([]);
    setError(null);
  }, [persist]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (pulseRef.current) cancelAnimationFrame(pulseRef.current);
  }, []);

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
