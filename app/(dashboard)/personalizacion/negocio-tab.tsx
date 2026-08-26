import type { Business } from "@/lib/business";
import { saveNegocio } from "./actions";

export function NegocioTab({ business }: { business: Business }) {
  return (
    <form action={saveNegocio} className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm">
          Nombre del negocio
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={business.name}
          className="border border-tinta bg-hueso px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm">
          Email de contacto
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={business.email ?? ""}
          className="border border-tinta bg-hueso px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="address" className="text-sm">
          Dirección
        </label>
        <input
          id="address"
          name="address"
          type="text"
          maxLength={200}
          defaultValue={business.address ?? ""}
          className="border border-tinta bg-hueso px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm">
          Descripción
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={1000}
          defaultValue={business.description ?? ""}
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <p className="text-sm text-tinta-suave">
          El agente usa esta información para responder preguntas sobre tu
          negocio.
        </p>
      </div>

      <button type="submit" className="self-start bg-tinta px-4 py-2 text-hueso">
        Guardar
      </button>
    </form>
  );
}
