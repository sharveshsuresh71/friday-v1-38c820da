import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Mic, Square, RotateCcw } from "lucide-react";
import { useFriday, type FridayState } from "@/hooks/use-friday";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FRIDAY — Voice AI Assistant You Talk To" },
      {
        name: "description",
        content:
          "FRIDAY is a hands-free voice AI assistant. Tap once, speak naturally, and hear a calm spoken reply — no typing, no setup.",
      },
      { property: "og:title", content: "FRIDAY — Voice AI Assistant You Talk To" },
      {
        property: "og:description",
        content:
          "Hands-free voice AI. Tap once, speak naturally, and hear a calm spoken reply — no typing, no setup.",
      },
    ],
  }),
  component: Index,
});

const STATUS_LABEL: Record<FridayState, string> = {
  idle: "Tap to start talking",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

function Orb({ state, level }: { state: FridayState; level: number }) {
  const active = state !== "idle";
  const scale = state === "listening" ? 1 + level * 0.22 : state === "speaking" ? 1.08 : 1;

  return (
    <div className="relative flex h-64 w-64 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full bg-halo blur-2xl transition-opacity duration-700"
        style={{ opacity: active ? 1 : 0.35 }}
      />
      <div
        className={`absolute inset-6 rounded-full border border-primary/25 ${
          state === "thinking" ? "animate-spin" : "animate-breathe"
        }`}
        style={{ animationDuration: state === "thinking" ? "2.4s" : undefined }}
      />
      <div
        className="h-32 w-32 rounded-full bg-linear-to-br from-primary/90 to-primary/40 shadow-orb transition-transform duration-100 ease-out"
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

function FridayScreen() {
  const { state, level, error, live, start, stop, clear, lastReply, lastAsk, turns } = useFriday();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-10 pb-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-[0.28em] uppercase">Friday</h1>
          <p className="mt-1 text-xs text-muted-foreground">Voice assistant</p>
        </div>
        {turns.length > 0 && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <Orb state={state} level={level} />

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {STATUS_LABEL[state]}
        </p>

        <div className="min-h-28 w-full space-y-3 text-center">
          {lastAsk && (
            <p key={lastAsk} className="animate-rise text-xs text-muted-foreground">
              “{lastAsk}”
            </p>
          )}
          {lastReply && (
            <p key={lastReply} className="animate-rise text-lg leading-relaxed text-foreground">
              {lastReply}
            </p>
          )}
          {!lastReply && !lastAsk && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Start the session, then just talk. FRIDAY hears when you stop and answers out loud.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-xs text-destructive-foreground">
            {error}
          </p>
        )}
      </div>

      <button
        onClick={live ? stop : () => void start()}
        className={`flex h-16 w-full items-center justify-center gap-3 rounded-full text-base font-medium transition-all active:scale-[0.98] ${
          live
            ? "border border-border bg-secondary text-secondary-foreground"
            : "bg-primary text-primary-foreground shadow-orb"
        }`}
      >
        {live ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {live ? "End session" : "Start talking"}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        Your conversation stays saved in this browser only.
      </p>
    </main>
  );
}

function Index() {
  return (
    <ClientOnly
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="h-32 w-32 rounded-full bg-primary/20 blur-xl" />
        </main>
      }
    >
      <FridayScreen />
    </ClientOnly>
  );
}
