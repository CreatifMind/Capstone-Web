type KpiCardProps = {
  label: string;
  value: string;
  detail?: string;
};

export default function KpiCard({ label, value, detail }: KpiCardProps) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
