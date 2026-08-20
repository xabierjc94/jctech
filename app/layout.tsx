import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JC Tech — Panel",
  description: "Panel de gestión del agente de WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
