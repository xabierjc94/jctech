import { MESSAGE_TEMPLATES } from "@/lib/business";
import { saveMessageTemplates } from "./actions";

export function MensajesTab({
  templates,
}: {
  templates: Record<string, string>;
}) {
  return (
    <form
      action={saveMessageTemplates}
      className="flex max-w-2xl flex-col gap-5"
    >
      {MESSAGE_TEMPLATES.map((template) => (
        <div key={template.key} className="flex flex-col gap-1">
          <label htmlFor={template.key} className="text-sm">
            {template.label}
          </label>
          <textarea
            id={template.key}
            name={template.key}
            rows={3}
            maxLength={1000}
            defaultValue={templates[template.key] ?? ""}
            className="border border-tinta bg-hueso px-3 py-2"
          />
          <p className="text-sm text-tinta-suave">{template.hint}</p>
        </div>
      ))}

      <button type="submit" className="self-start bg-tinta px-4 py-2 text-hueso">
        Guardar
      </button>
    </form>
  );
}
