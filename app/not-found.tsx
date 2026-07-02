import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <section className="not-found-card">
        <p className="eyebrow">PurityLoop AI</p>
        <h1>Page not found</h1>
        <p>The route you opened does not exist in the PurityLoop AI platform.</p>
        <Link href="/" className="btn btn-primary">
          Back to Home
        </Link>
      </section>
    </main>
  );
}
