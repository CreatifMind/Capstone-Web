import type { ReactNode } from "react";
import UploadBrowserInferenceBridge from "@/components/UploadBrowserInferenceBridge";

export default function UploadLayout({ children }: { children: ReactNode }) {
  const flags = {
    single: process.env.NEXT_PUBLIC_BROWSER_ONNX_ENABLED === "true",
    multi: process.env.NEXT_PUBLIC_BROWSER_ONNX_MULTI_ENABLED === "true",
    zip: process.env.NEXT_PUBLIC_BROWSER_ONNX_ZIP_ENABLED === "true",
    webcam: process.env.NEXT_PUBLIC_BROWSER_ONNX_WEBCAM_ENABLED === "true"
  };

  return (
    <>
      <UploadBrowserInferenceBridge flags={flags} />
      {children}
    </>
  );
}
