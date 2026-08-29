import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/friday/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["ELEVENLABS_API_KEY"];
        const voiceId = process.env["ELEVENLABS_VOICE_ID"];
        if (!key || !voiceId) return new Response("Voice is not configured", { status: 500 });

        const body = (await request.json().catch(() => null)) as { text?: string } | null;
        const text = body?.text?.trim();
        if (!text) return new Response("Text is required", { status: 400 });

        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: text.slice(0, 4000),
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.4,
                similarity_boost: 0.85,
                style: 0.5,
                use_speaker_boost: true,
              },
            }),
          },
        );

        if (!res.ok || !res.body) {
          const errorBody = await res.text().catch(() => "");
          console.error(`ElevenLabs speech failed [${res.status}]: ${errorBody}`);
          return new Response(errorBody || "Speech failed", { status: res.status });
        }

        return new Response(res.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
