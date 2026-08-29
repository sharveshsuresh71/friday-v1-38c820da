import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 12 * 1024 * 1024;

export const Route = createFileRoute("/api/friday/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Was: process.env["LOVABLE_API_KEY"] via ai.gateway.lovable.dev
        const key = process.env["OPENAI_API_KEY"];
        if (!key) return new Response("AI is not configured", { status: 500 });

        const form = await request.formData();
        const audio = form.get("audio");
        if (!(audio instanceof File) || audio.size === 0) {
          return new Response("No audio provided", { status: 400 });
        }
        if (audio.size > MAX_BYTES) {
          return new Response("Recording too long", { status: 413 });
        }

        const upstream = new FormData();
        upstream.append("model", "gpt-4o-mini-transcribe");
        upstream.append("file", audio, "recording.wav");

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(`Transcription failed [${res.status}]: ${body}`);
          return new Response(body || "Transcription failed", { status: res.status });
        }

        const data = (await res.json()) as { text?: string };
        return Response.json({ text: (data.text ?? "").trim() });
      },
    },
  },
});
