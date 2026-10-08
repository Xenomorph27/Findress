import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { isOwnerRequest } from "@/lib/auth/session";
import { buildEventSystemPrompt, buildGlobalSystemPrompt } from "@/lib/ai/context";
import { aiConfigError, getChatModel, maxOutputTokens } from "@/lib/ai/model";
import { buildTools } from "@/lib/ai/tools";
import {
  checkRateLimit,
  clearChat,
  loadChat,
  recordUsageEnd,
  recordUsageStart,
  saveChat,
} from "@/lib/ai/usage";
import { getEventDetail } from "@/lib/data/events";
import { getDb } from "@/lib/db";
import { DEFAULT_TIMEZONE } from "@/lib/site";

/**
 * POST   /api/chat            stream an answer (owner only; rate-limited; token-capped)
 * GET    /api/chat?scope=…    saved conversation for a scope ("event:<id>" | "global")
 * DELETE /api/chat?scope=…    clear it
 */
export const maxDuration = 120;

const BodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(60),
  eventSlug: z.string().max(160).nullable().optional(),
  tz: z.string().max(60).optional(),
});

function validScope(scope: string | null): scope is string {
  return !!scope && /^(global|event:\d+)$/.test(scope);
}

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const scope = new URL(request.url).searchParams.get("scope");
  if (!validScope(scope)) return Response.json({ error: "bad scope" }, { status: 400 });
  const db = getDb();
  if (!db) return Response.json({ messages: [] });
  return Response.json(
    { messages: await loadChat(db, scope) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const scope = new URL(request.url).searchParams.get("scope");
  if (!validScope(scope)) return Response.json({ error: "bad scope" }, { status: 400 });
  const db = getDb();
  if (db) await clearChat(db, scope);
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  if (!(await isOwnerRequest(request))) {
    return Response.json(
      { error: "unauthorized", message: "Unlock FIndress to use the assistant." },
      { status: 401 },
    );
  }
  const configError = aiConfigError();
  if (configError) {
    return Response.json({ error: "ai-not-configured", message: configError }, { status: 503 });
  }
  const db = getDb();
  if (!db)
    return Response.json(
      { error: "db-not-configured", message: "DATABASE_URL is not set." },
      { status: 503 },
    );

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const tz = parsed.data.tz && isValidZone(parsed.data.tz) ? parsed.data.tz : DEFAULT_TIMEZONE;

  const limit = await checkRateLimit(db);
  if (!limit.ok) {
    return Response.json(
      {
        error: "rate-limited",
        message: `Hourly limit reached (${limit.limit} messages). Try again later.`,
      },
      { status: 429 },
    );
  }

  const event = parsed.data.eventSlug ? await getEventDetail(parsed.data.eventSlug) : null;
  if (parsed.data.eventSlug && !event)
    return Response.json({ error: "event not found" }, { status: 404 });
  const scope = event ? `event:${event.id}` : "global";

  const allowedHosts = event
    ? [event.website, event.cfpUrl]
        .filter((u): u is string => !!u)
        .map((u) => new URL(u).hostname.replace(/^www\./, ""))
    : [];
  const tools = buildTools({ tz, allowedHosts });

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages<UIMessage>({ messages: parsed.data.messages, tools });
  } catch {
    return Response.json({ error: "invalid messages" }, { status: 400 });
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
  if (question.length > 4000) return Response.json({ error: "message too long" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const system = event
    ? buildEventSystemPrompt(event, question, tz, today).system
    : buildGlobalSystemPrompt(tz, today);
  const { model, providerOptions } = getChatModel();
  const usageId = await recordUsageStart(db, scope);

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(6),
    maxOutputTokens: maxOutputTokens(),
    providerOptions: providerOptions as never,
    abortSignal: request.signal,
    onFinish: async ({ totalUsage }) => {
      await recordUsageEnd(db, usageId, totalUsage.inputTokens, totalUsage.outputTokens).catch(
        () => {},
      );
    },
    onError: ({ error }) => console.error("[chat]", error),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      sendReasoning: false,
      messageMetadata: ({ part }) =>
        part.type === "finish" ? { finishReason: part.finishReason, model: undefined } : undefined,
      onError: (error) => {
        console.error("[chat] stream", error);
        return "The assistant hit an error. Please try again.";
      },
      onEnd: async ({ messages: all }) => {
        await saveChat(db, scope, event?.id ?? null, all.slice(-40)).catch((err) =>
          console.error("[chat] save", err),
        );
      },
    }),
  });
}
