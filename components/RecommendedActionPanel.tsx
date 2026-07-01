export default function RecommendedActionPanel({ action }: { action: string }) {
  return (
    <section className="action-panel">
      <h3>Recommended action</h3>
      <p>{action}</p>
    </section>
  );
}
