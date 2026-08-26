import type { Service } from "@/lib/business";
import { addService, deleteService } from "./actions";

export function ServiciosTab({ services }: { services: Service[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {services.length === 0 && (
        <p className="text-tinta-suave">
          Todavía no has añadido ningún servicio.
        </p>
      )}

      {services.map((service) => (
        <div
          key={service.id}
          className="flex items-start justify-between border border-tinta/20 px-4 py-3"
        >
          <div>
            <p>{service.name}</p>
            {service.description && (
              <p className="text-sm text-tinta-suave">{service.description}</p>
            )}
            <p className="text-sm text-tinta-suave">
              {service.duration_minutes} min · ID: {service.slug}
            </p>
          </div>
          <form action={deleteService}>
            <input type="hidden" name="id" value={service.id} />
            <button
              type="submit"
              className="text-sm text-bermellon hover:underline"
            >
              Eliminar
            </button>
          </form>
        </div>
      ))}

      <form
        action={addService}
        className="flex flex-col gap-3 border-t border-tinta/20 pt-6"
      >
        <p className="text-sm">Añadir servicio</p>

        <div className="flex gap-3">
          <input
            name="name"
            type="text"
            placeholder="Nombre"
            required
            maxLength={100}
            className="flex-1 border border-tinta bg-hueso px-3 py-2"
          />
          <input
            name="duration_minutes"
            type="number"
            placeholder="Minutos"
            required
            min={1}
            max={600}
            defaultValue={30}
            className="w-32 border border-tinta bg-hueso px-3 py-2"
          />
        </div>

        <textarea
          name="description"
          rows={2}
          placeholder="Descripción (opcional)"
          maxLength={500}
          className="border border-tinta bg-hueso px-3 py-2"
        />

        <button
          type="submit"
          className="self-start bg-tinta px-4 py-2 text-hueso"
        >
          Añadir
        </button>
      </form>
    </div>
  );
}
