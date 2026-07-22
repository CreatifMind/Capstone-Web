import { MODEL_CONFIG } from "./model-config";
import type { PreprocessResult } from "./types";

export function preprocessImage(image: HTMLImageElement): PreprocessResult {
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;
  const scale = Math.min(MODEL_CONFIG.inputSize / originalWidth, MODEL_CONFIG.inputSize / originalHeight);
  const resizedWidth = Math.round(originalWidth * scale);
  const resizedHeight = Math.round(originalHeight * scale);
  const padX = Math.floor((MODEL_CONFIG.inputSize - resizedWidth) / 2);
  const padY = Math.floor((MODEL_CONFIG.inputSize - resizedHeight) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_CONFIG.inputSize;
  canvas.height = MODEL_CONFIG.inputSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Browser canvas is unavailable.");

  context.fillStyle = `rgb(${MODEL_CONFIG.paddingValue}, ${MODEL_CONFIG.paddingValue}, ${MODEL_CONFIG.paddingValue})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, padX, padY, resizedWidth, resizedHeight);

  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const planeSize = MODEL_CONFIG.inputSize * MODEL_CONFIG.inputSize;
  const data = new Float32Array(planeSize * 3);
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    const rgbaOffset = pixel * 4;
    data[pixel] = rgba[rgbaOffset] / 255;
    data[planeSize + pixel] = rgba[rgbaOffset + 1] / 255;
    data[(planeSize * 2) + pixel] = rgba[rgbaOffset + 2] / 255;
  }

  return { data, letterbox: { originalWidth, originalHeight, resizedWidth, resizedHeight, scale, padX, padY } };
}
