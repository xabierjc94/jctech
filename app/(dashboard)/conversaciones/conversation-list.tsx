import Link from "next/link";
import type { Conversation } from "@/lib/conversations";
import { formatShortDate, formatTime } from "@/lib/dates";

export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId: string | null;
}) {
  return (
    <div className="w-72 shrink-0 border-r border-tinta/20">
      <p className="border-b border-tinta/20 px-4 py-3 text-lg">
        Conversaciones
      </p>

      {conversations.length === 0 && (
        <p className="px-4 py-6 text-sm text-tinta-suave">
          Todavía no hay conversaciones.
        </p>
      )}

      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/conversaciones?c=${conversation.id}`}
          className={
            conversation.id === activeId
              ? "block border-b border-tinta/20 bg-hueso-hondo px-4 py-3"
              : "block border-b border-tinta/20 px-4 py-3 hover:bg-hueso-hondo"
          }
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">
              {conversation.contact_name ?? conversation.contact_phone}
            </span>
            <span className="shrink-0 text-xs text-tinta-suave">
              {formatShortDate(conversation.last_message_at)}
            </span>
          </div>
          <p className="text-xs text-tinta-suave">
            {formatTime(conversation.last_message_at)}
            {!conversation.bot_active && " · Manual"}
          </p>
        </Link>
      ))}
    </div>
  );
}
