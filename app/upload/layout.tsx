import type { ReactNode } from "react";
import UploadBrowserInferenceBridge from "@/components/UploadBrowserInferenceBridge";

export default function UploadLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <UploadBrowserInferenceBridge enabled={process.env.NEXT_PUBLIC_BROWSER_ONNX_ENABLED === "true"} />
      {children}
    </>
  );
}
