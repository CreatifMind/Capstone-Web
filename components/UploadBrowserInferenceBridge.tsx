"use client";

import { useEffect } from "react";
import type { Detection } from "@/lib/inference/types";

export type UploadBrowserDetectionResult = {
  originalWidth: number;
  originalHeight: number;
  detections: Detection[];
  reviewDetections: Detection[];
};

export type UploadBrowserInferenceFlags = {
  single: boolean;
  multi: boolean;
  zip: boolean;
  webcam: boolean;
};

export type UploadBrowserInferenceApi = {
  enabled: boolean;
  flags: UploadBrowserInferenceFlags;
  detect(file: File): Promise<UploadBrowserDetectionResult>;
};

declare global {
  interface Window {
    __PURITYLOOP_BROWSER_ONNX__?: UploadBrowserInferenceApi;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image is invalid or corrupted."));
    image.src = url;
  });
}

export default function UploadBrowserInferenceBridge({ flags }: { flags: UploadBrowserInferenceFlags }) {
  const enabled = flags.single;

  useEffect(() => {
    const api: UploadBrowserInferenceApi = {
      enabled,
      flags,
      async detect(file) {
        if (!enabled) throw new Error("Browser ONNX is disabled.");
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
          throw new Error("Browser ONNX supports JPG, JPEG, PNG, and WEBP images.");
        }

        const objectUrl = URL.createObjectURL(file);
        try {
          const [{ preprocessImage }, { runModel }, { postprocessOutput }] = await Promise.all([
            import("@/lib/inference/preprocess"),
            import("@/lib/inference/onnx-session"),
            import("@/lib/inference/postprocess")
          ]);
          const image = await loadImage(objectUrl);
          const { data, letterbox } = preprocessImage(image);
          const { output } = await runModel(data);
          return {
            originalWidth: letterbox.originalWidth,
            originalHeight: letterbox.originalHeight,
            ...postprocessOutput(output, letterbox)
          };
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
    };

    window.__PURITYLOOP_BROWSER_ONNX__ = api;
    window.dispatchEvent(new CustomEvent("purityloop:browser-onnx-ready"));
    return () => {
      if (window.__PURITYLOOP_BROWSER_ONNX__ === api) delete window.__PURITYLOOP_BROWSER_ONNX__;
    };
  }, [enabled, flags]);

  return (
    <span
      id="browserOnnxFeatureFlag"
      data-enabled={String(enabled)}
      data-multi={String(flags.multi)}
      data-zip={String(flags.zip)}
      data-webcam={String(flags.webcam)}
      hidden
    />
  );
}
