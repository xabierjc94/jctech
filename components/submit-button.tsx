"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de envío que se deshabilita mientras la Server Action está en curso.
 * Sin esto, un doble clic envía el formulario dos veces: en onboarding llegó a
 * crear dos negocios idénticos con un segundo de diferencia.
 *
 * `useFormStatus` lee el estado del <form> padre, así que este componente debe
 * usarse dentro del formulario, nunca fuera.
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  formAction,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  /** Para formularios con varios botones que disparan acciones distintas. */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (pendingText ?? "Enviando…") : children}
    </button>
  );
}
