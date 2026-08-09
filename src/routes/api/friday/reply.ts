import { createFileRoute } from "@tanstack/react-router";

type Turn = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = [
  "You are FRIDAY, a calm, quick-witted personal AI assistant speaking out loud.",
  "You address the user as 'boss' occasionally, never in every reply.",
  "Keep answers short and conversational: one to three sentences, plain spoken language.",
  "Never use markdown, bullet points, emoji, headings, or code blocks — your text is read aloud.",
  "Spell out anything that would sound wrong when spoken. Ask a brief clarifying question when a request is ambiguous.",
  "If asked to sing, sing: write the lyrics as flowing spoken lines with expressive punctuation and elongated vowels (like 'oooh', 'laaa'), never as a list or with song titles in brackets.",
].join(" ");


export const Route = createFileRoute("/api/friday/reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => null)) as { history?: Turn[] } | null;
        const history = Array.isArray(body?.history) ? body.history : null;
        if (!history || history.length === 0) {
          return new Response("History is required", { status: 400 });
        }

        const trimmed = history
          .filter((t) => typeof t?.content === "string" && t.content.trim().length > 0)
          .slice(-24)
          .map((t) => ({ role: t.role, content: t.content }));

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          console.error(`Reply failed [${res.status}]: ${errorBody}`);
          return new Response(errorBody || "Reply failed", { status: res.status });
        }

        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content?.trim() ?? "";
        if (!text) return new Response("Empty reply from model", { status: 502 });

        return Response.json({ text });
      },
    },
  },
});
