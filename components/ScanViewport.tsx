import type { ReactNode } from "react";

export default function ScanViewport({ children }: { children?: ReactNode }) {
  return <div className="stream-canvas-wrap">{children}</div>;
}
