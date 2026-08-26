import type { Business } from "@/lib/business";
import { saveGeneral } from "./actions";
import { TONES } from "./tones";

export function GeneralTab({ business }: { business: Business }) {
  return (
    <form action={saveGeneral} className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="tone" className="text-sm">
          Tono
        </label>
        <select
          id="tone"
          name="tone"
          defaultValue={business.tone}
          className="border border-tinta bg-hueso px-3 py-2"
        >
          {TONES.map((tone) => (
            <option key={tone} value={tone}>
              {tone}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="base_prompt" className="text-sm">
          Prompt base
        </label>
        <textarea
          id="base_prompt"
          name="base_prompt"
          rows={14}
          defaultValue={business.base_prompt}
          className="border border-tinta bg-hueso px-3 py-2 font-mono text-sm"
        />
        <p className="text-sm text-tinta-suave">
          Este texto se inyecta como instrucción base del modelo en cada
          respuesta.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ask_new_patient"
          defaultChecked={business.ask_new_patient}
        />
        Preguntar si es cliente nuevo al agendar
      </label>

      <button type="submit" className="self-start bg-tinta px-4 py-2 text-hueso">
        Guardar
      </button>
    </form>
  );
}
