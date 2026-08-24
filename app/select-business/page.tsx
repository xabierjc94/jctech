import Link from "next/link";
import { getUserBusinesses } from "@/lib/business";

export default async function SelectBusinessPage() {
  const businesses = await getUserBusinesses();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl">Elige un negocio</h1>
      {businesses.map((b) => (
        <Link
          key={b.business_id}
          href={`/dashboard?business=${b.business_id}`}
          className="border border-tinta px-4 py-3"
        >
          {b.businesses.name}
        </Link>
      ))}
    </main>
  );
}
