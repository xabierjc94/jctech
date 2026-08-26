import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { handleInboundMessage } from "@/lib/agent/inbound";

// El agente puede tardar varios segundos entre llamadas a Claude y consultas.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

function signatureIsValid(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = header.slice("sha256=".length);

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex")
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!signatureIsValid(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      for (const message of value?.messages ?? []) {
        if (!phoneNumberId || !message?.from) continue;

        const contactName =
          value?.contacts?.find((c: any) => c?.wa_id === message.from)?.profile
            ?.name ?? null;

        const text =
          message.type === "text"
            ? message.text?.body
            : "[el cliente ha enviado un mensaje que no es de texto]";

        if (!text) continue;

        try {
          await handleInboundMessage({
            phoneNumberId,
            fromPhone: message.from,
            contactName,
            text,
          });
        } catch (error) {
          // Meta reintenta si no devolvemos 200, y reintentar una y otra vez
          // duplicaría mensajes. Se registra y se sigue.
          console.error("Error procesando mensaje entrante:", error);
        }
      }
    }
  }

  return new NextResponse("OK", { status: 200 });
}
