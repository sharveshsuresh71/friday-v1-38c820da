import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/friday/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => null)) as { text?: string } | null;
        const text = body?.text?.trim();
        if (!text) return new Response("Text is required", { status: 400 });

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text.slice(0, 4000),
            voice: "shimmer",
            instructions: "Calm, warm, composed. Speak like a quietly capable personal assistant.",
            response_format: "mp3",
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          console.error(`Speech failed [${res.status}]: ${errorBody}`);
          return new Response(errorBody || "Speech failed", { status: res.status });
        }

        return new Response(res.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
