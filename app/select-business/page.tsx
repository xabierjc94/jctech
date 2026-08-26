import { getUserBusinesses } from "@/lib/business";
import { selectBusiness } from "./actions";

export default async function SelectBusinessPage() {
  const businesses = await getUserBusinesses();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl">Elige un negocio</h1>
      {businesses.map((b) => (
        <form key={b.business_id} action={selectBusiness}>
          <input type="hidden" name="business_id" value={b.business_id} />
          <button
            type="submit"
            className="w-full border border-tinta px-4 py-3 text-left hover:bg-hueso-hondo"
          >
            {b.businesses.name}
          </button>
        </form>
      ))}
    </main>
  );
}
