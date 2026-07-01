import type { ReactNode } from "react";

export default function AnimatedCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`motion-card ${className}`}>{children}</div>;
}
