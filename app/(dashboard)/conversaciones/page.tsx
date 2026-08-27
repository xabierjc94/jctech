import {
  getConversation,
  getConversations,
  getMessages,
} from "@/lib/conversations";
import { SubmitButton } from "@/components/submit-button";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { BotToggle } from "./bot-toggle";
import { sendHumanMessage } from "./actions";

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; error?: string }>;
}) {
  const params = await searchParams;
  const conversations = await getConversations();
  const activeId = params.c ?? conversations[0]?.id ?? null;

  const [conversation, messages] = activeId
    ? await Promise.all([getConversation(activeId), getMessages(activeId)])
    : [null, []];

  return (
    <div className="-mx-8 -my-6 flex min-h-screen">
      <ConversationList
        conversations={conversations}
        activeId={conversation?.id ?? null}
      />

      <div className="flex flex-1 flex-col">
        {!conversation && (
          <p className="px-6 py-6 text-tinta-suave">
            Selecciona una conversación para verla.
          </p>
        )}

        {conversation && (
          <>
            <div className="flex items-center justify-between border-b border-tinta/20 px-6 py-3">
              <div>
                <p>{conversation.contact_name ?? "Sin nombre"}</p>
                <p className="text-sm text-tinta-suave">
                  {conversation.contact_phone}
                </p>
              </div>
              <BotToggle
                conversationId={conversation.id}
                botActive={conversation.bot_active}
              />
            </div>

            {params.error && (
              <p className="mx-6 mt-4 rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
                {params.error}
              </p>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <MessageThread messages={messages} />
            </div>

            <form
              action={sendHumanMessage}
              className="flex items-end gap-2 border-t border-tinta/20 px-6 py-4"
            >
              <input
                type="hidden"
                name="conversation_id"
                value={conversation.id}
              />
              <textarea
                name="content"
                rows={2}
                required
                maxLength={1000}
                placeholder="Escribe una respuesta…"
                className="flex-1 border border-tinta bg-hueso px-3 py-2"
              />
              <SubmitButton
                className="bg-tinta px-4 py-2 text-hueso"
                pendingText="Enviando…"
              >
                Enviar
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
