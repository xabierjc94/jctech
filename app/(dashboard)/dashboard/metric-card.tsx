export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="border border-tinta/20 px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className="cifra my-1 text-4xl">{value}</p>
      <p className="text-sm text-tinta-suave">{hint}</p>
    </div>
  );
}
