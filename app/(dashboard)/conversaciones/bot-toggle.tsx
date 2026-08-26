import { toggleBot } from "./actions";

export function BotToggle({
  conversationId,
  botActive,
}: {
  conversationId: string;
  botActive: boolean;
}) {
  return (
    <form action={toggleBot} className="flex items-center gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="next_value" value={String(!botActive)} />
      <button
        type="submit"
        className={
          botActive
            ? "border border-oliva px-3 py-1 text-sm text-oliva"
            : "border border-bermellon px-3 py-1 text-sm text-bermellon"
        }
      >
        {botActive ? "Bot activo" : "Bot en pausa"}
      </button>
    </form>
  );
}
