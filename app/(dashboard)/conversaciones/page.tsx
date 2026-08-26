import {
  getConversation,
  getConversations,
  getMessages,
} from "@/lib/conversations";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { BotToggle } from "./bot-toggle";

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
          </>
        )}
      </div>
    </div>
  );
}
