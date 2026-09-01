import Link from "next/link";

export const TABS = [
  { id: "conexiones", label: "Conexiones" },
  { id: "equipo", label: "Equipo" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function isTabId(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function Tabs({ active }: { active: TabId }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-tinta/20">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/integraciones?tab=${tab.id}`}
          className={
            tab.id === active
              ? "border-b-2 border-bermellon px-4 py-2 text-bermellon"
              : "px-4 py-2 text-tinta-suave hover:text-tinta"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
