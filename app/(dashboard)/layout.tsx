import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserBusinesses } from "@/lib/business";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/conversaciones", label: "Conversaciones" },
  { href: "/citas", label: "Citas" },
  { href: "/personalizacion", label: "Personalización" },
  { href: "/integraciones", label: "Integraciones" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const businesses = await getUserBusinesses();

  if (businesses.length === 0) {
    redirect("/onboarding");
  }

  if (businesses.length > 1) {
    redirect("/select-business");
  }

  const business = businesses[0].businesses;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-tinta px-4 py-6">
        <p className="text-xs uppercase text-tinta-suave">Negocio</p>
        <p className="mb-6 text-lg">{business.name}</p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 hover:bg-hueso-hondo"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 px-8 py-6">{children}</div>
    </div>
  );
}
