import { createFileRoute } from "@tanstack/react-router";

// Warm, realistic female voices. The configured voice is tried first, then these
// defaults — library voices are rejected on free ElevenLabs plans.
const FEMALE_VOICES = [
  "EXAVITQu4vr4xnSDxMaL", // Sarah — warm, natural
  "cgSgspJ2msm6clMCkdW9", // Jessica — expressive
  "XrExE9yKIg1WjnnlVkGX", // Matilda — soft
];

export const Route = createFileRoute("/api/friday/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { text?: string } | null;
        const text = body?.text?.trim();
        if (!text) return new Response("Text is required", { status: 400 });

        const elevenKey = process.env["ELEVENLABS_API_KEY"];
        const configured = process.env["ELEVENLABS_VOICE_ID"];

        if (elevenKey) {
          const voices = [...(configured ? [configured] : []), ...FEMALE_VOICES].filter(
            (v, i, a) => a.indexOf(v) === i,
          );

          for (const voiceId of voices) {
            const res = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
              {
                method: "POST",
                headers: {
                  "xi-api-key": elevenKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  text: text.slice(0, 4000),
                  // Highest-realism model — handles singing/expressive delivery best.
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

            if (res.ok && res.body) {
              return new Response(res.body, {
                headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
              });
            }

            console.error(
              `ElevenLabs speech failed for ${voiceId} [${res.status}]: ${await res
                .text()
                .catch(() => "")}`,
            );
          }
        }




        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("AI is not configured", { status: 500 });

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
