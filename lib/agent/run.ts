import type Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_EFFORT,
  AGENT_MAX_TOKENS,
  AGENT_MODEL,
  getAnthropic,
} from "@/lib/agent/client";
import { AGENT_TOOLS, runTool, type ToolContext } from "@/lib/agent/tools";

/** Tope de vueltas del bucle para que un webhook no se quede colgado. */
const MAX_ITERATIONS = 6;

export type AgentReply = {
  text: string;
  handoff: boolean;
};

export async function runAgent({
  systemPrompt,
  messages,
  context,
}: {
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  context: ToolContext;
}): Promise<AgentReply> {
  const client = getAnthropic();
  const history: Anthropic.MessageParam[] = [...messages];
  let handoff = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: AGENT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: AGENT_EFFORT },
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: AGENT_TOOLS,
      messages: history,
    });

    if (response.stop_reason === "refusal") {
      return {
        text: "Prefiero que este tema lo vea una persona del equipo. Te paso con alguien.",
        handoff: true,
      };
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      return { text, handoff };
    }

    history.push({ role: "assistant", content: response.content });

    // Todos los resultados van en un único mensaje de usuario: separarlos
    // enseña al modelo a dejar de pedir herramientas en paralelo.
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      try {
        const outcome = await runTool(toolUse.name, toolUse.input, context);
        if (outcome.handoff) handoff = true;
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: outcome.content,
        });
      } catch {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "La herramienta falló. Discúlpate y ofrece continuar más tarde.",
          is_error: true,
        });
      }
    }

    history.push({ role: "user", content: results });
  }

  return {
    text: "Disculpa, me he liado. Te paso con una persona del equipo.",
    handoff: true,
  };
}
