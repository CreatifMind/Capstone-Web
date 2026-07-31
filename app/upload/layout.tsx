import type { ReactNode } from "react";
import UploadBrowserInferenceBridge from "@/components/UploadBrowserInferenceBridge";

function enabledByDefault(name: string) {
  return process.env[name] !== "false";
}

export default function UploadLayout({ children }: { children: ReactNode }) {
  const flags = {
    single: enabledByDefault("NEXT_PUBLIC_BROWSER_ONNX_ENABLED"),
    multi: enabledByDefault("NEXT_PUBLIC_BROWSER_ONNX_MULTI_ENABLED"),
    zip: enabledByDefault("NEXT_PUBLIC_BROWSER_ONNX_ZIP_ENABLED"),
    webcam: enabledByDefault("NEXT_PUBLIC_BROWSER_ONNX_WEBCAM_ENABLED")
  };

  return (
    <>
      <UploadBrowserInferenceBridge flags={flags} />
      {children}
    </>
  );
}
