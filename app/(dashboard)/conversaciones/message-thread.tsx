import type { Message } from "@/lib/conversations";
import { formatTime } from "@/lib/dates";

const SENDER_LABEL: Record<Message["sender"], string> = {
  cliente: "Cliente",
  agente_ia: "Agente IA",
  humano: "Humano",
};

function bubbleClass(sender: Message["sender"]): string {
  if (sender === "cliente") {
    return "mr-auto bg-hueso-hondo";
  }
  if (sender === "agente_ia") {
    return "ml-auto bg-oliva text-hueso";
  }
  return "ml-auto bg-tinta text-hueso";
}

export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-tinta-suave">Esta conversación no tiene mensajes.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`max-w-[80%] rounded px-4 py-2 ${bubbleClass(
            message.sender
          )}`}
        >
          <p className="mb-1 text-xs opacity-70">
            {SENDER_LABEL[message.sender]} · {formatTime(message.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      ))}
    </div>
  );
}
