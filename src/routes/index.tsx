import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Mic, Square, RotateCcw } from "lucide-react";
import { useFriday, type FridayState } from "@/hooks/use-friday";
import { FridayOrb } from "@/components/friday-orb";


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
          "FRIDAY is a hands-free voice AI assistant. Tap once, speak naturally, and hear a calm spoken reply — no typing, no setup.",
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
  return (
    <div className="relative mx-auto aspect-square w-[min(88vw,26rem)]">
      <div
        className="pointer-events-none absolute -inset-16 rounded-full blur-3xl transition-opacity duration-700"
        style={{
          background: "radial-gradient(circle at 50% 50%, var(--halo), transparent 70%)",
          opacity: state === "idle" ? 0.5 : 1,
        }}
      />
      <div
        className="pointer-events-none absolute inset-1 rounded-full border border-primary/15"
        style={{ transform: `scale(${1 + level * 0.06})`, transition: "transform 120ms linear" }}
      />
      <div className="pointer-events-none absolute inset-12 rounded-full border border-primary/10" />
      <FridayOrb state={state} level={level} />
    </div>
  );
}

function FridayScreen() {
  const { state, level, error, live, start, stop, clear, lastReply, lastAsk, turns } = useFriday();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 50% -10%, var(--halo), transparent 60%), radial-gradient(90% 50% at 50% 110%, var(--halo), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 40%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 40%, black, transparent 75%)",
        }}
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 pt-10 pb-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-lg font-medium tracking-[0.34em] text-transparent uppercase">
              Friday
            </h1>
            <p className="mt-1 text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              Voice assistant
            </p>
          </div>
          {turns.length > 0 && (
            <button
              onClick={clear}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <Orb state={state} level={level} />

          <div
            className="flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 backdrop-blur-md"
            aria-live="polite"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full bg-primary ${
                  state === "idle" ? "" : "animate-ping"
                } opacity-70`}
              />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
              {STATUS_LABEL[state]}
            </span>
          </div>

          <div className="min-h-28 w-full space-y-3 text-center">
            {lastAsk && (
              <p key={lastAsk} className="animate-rise text-xs text-muted-foreground italic">
                “{lastAsk}”
              </p>
            )}
            {lastReply && (
              <p
                key={lastReply}
                className="animate-rise rounded-2xl border border-border bg-card/40 px-5 py-4 text-base leading-relaxed text-foreground backdrop-blur-md"
              >
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
          className={`group relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-full text-base font-medium tracking-wide transition-all active:scale-[0.98] ${
            live
              ? "border border-border bg-secondary/70 text-secondary-foreground backdrop-blur-md"
              : "bg-gradient-to-r from-primary to-chart-2 text-primary-foreground shadow-orb"
          }`}
        >
          {live ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {live ? "End session" : "Start talking"}
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          Your conversation stays saved in this browser only.
        </p>
      </main>
    </div>
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
