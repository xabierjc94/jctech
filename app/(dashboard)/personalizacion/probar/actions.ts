"use server";

import { redirect } from "next/navigation";
import {
  getActiveBusiness,
  getBusinessHours,
  getMessageTemplates,
  getServices,
} from "@/lib/business";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { runAgent } from "@/lib/agent/run";
import type Anthropic from "@anthropic-ai/sdk";

const MAX_TURNS = 20;

type Turn = { role: "user" | "assistant"; text: string };

function parseHistory(raw: string): Turn[] {
  try {
    const parsed = JSON.parse(raw) as Turn[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_TURNS) : [];
  } catch {
    return [];
  }
}

export async function sendTestMessage(formData: FormData) {
  const message = String(formData.get("message") ?? "").trim();
  const history = parseHistory(String(formData.get("history") ?? "[]"));

  if (!message) {
    redirect(
      `/personalizacion/probar?h=${encodeURIComponent(JSON.stringify(history))}`
    );
  }

  const [business, hours, services, templates] = await Promise.all([
    getActiveBusiness(),
    getBusinessHours(),
    getServices(),
    getMessageTemplates(),
  ]);

  const now = new Date();

  const turns: Turn[] = [...history, { role: "user", text: message }];

  const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  let replyText: string;

  try {
    const reply = await runAgent({
      systemPrompt: buildSystemPrompt({
        business,
        hours,
        services,
        templates,
        nowIso: now.toISOString(),
      }),
      messages,
      context: {
        businessId: business.id,
        conversationId: null,
        contactPhone: null,
        hours,
        services,
        dryRun: true,
        now,
      },
    });
    replyText = reply.text || "(sin respuesta)";
  } catch (error) {
    replyText = `[error al llamar al agente: ${
      error instanceof Error ? error.message : "desconocido"
    }]`;
  }

  const next: Turn[] = [
    ...turns,
    { role: "assistant" as const, text: replyText },
  ].slice(-MAX_TURNS);

  redirect(
    `/personalizacion/probar?h=${encodeURIComponent(JSON.stringify(next))}`
  );
}
