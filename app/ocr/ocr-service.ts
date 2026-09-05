"use client";

import type { OcrResult } from "@paddleocr/paddleocr-js";
import { OCR_MODE_OPTIONS, type OcrBlock, type OcrMode, type OcrPageResult } from "./ocr-types";

type OcrRunner = { predict: (input: ImageBitmap) => Promise<OcrResult[]> };

let ocrInstance: Promise<OcrRunner> | null = null;
const LOCAL_MODEL_ROOT = "/ocr-models/";
const LOCAL_RUNTIME_ROOT = "/ocr-runtime/";

async function createLocalWasmPaths() {
  // ONNX Runtime dynamically imports its ESM factory. Passing a /public URL
  // directly makes Vite try to transform that import during development.
  // Load the bundled module as a Blob URL instead: it remains entirely local,
  // while its companion WASM path stays an ordinary static HTTP resource.
  const moduleUrl = `${LOCAL_RUNTIME_ROOT}ort-wasm-simd-threaded.jsep.mjs`;
  const response = await fetch(moduleUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error("OCR 本地运行时模块缺失，请重新安装 INS");
  const moduleText = await response.text();
  return {
    mjs: URL.createObjectURL(
      new Blob([moduleText], { type: "text/javascript" }),
    ),
    wasm: `${LOCAL_RUNTIME_ROOT}ort-wasm-simd-threaded.jsep.wasm`,
  };
}

async function getOcr() {
  if (!ocrInstance) {
    ocrInstance = Promise.all([
      import("@paddleocr/paddleocr-js"),
      createLocalWasmPaths(),
    ]).then(([{ PaddleOCR }, wasmPaths]) =>
      PaddleOCR.create({
        lang: "ch",
        ocrVersion: "PP-OCRv5",
        worker: true,
        textDetectionModelName: "PP-OCRv5_mobile_det",
        textDetectionModelAsset: {
          url: `${LOCAL_MODEL_ROOT}PP-OCRv5_mobile_det_onnx_infer.tar`,
        },
        textRecognitionModelName: "PP-OCRv5_mobile_rec",
        textRecognitionModelAsset: {
          url: `${LOCAL_MODEL_ROOT}PP-OCRv5_mobile_rec_onnx_infer.tar`,
        },
        ortOptions: {
          backend: "wasm",
          // PaddleOCR's public type still exposes the legacy string form,
          // while the bundled ONNX Runtime accepts the documented mjs/wasm map.
          wasmPaths: wasmPaths as unknown as string,
          numThreads: 2,
          simd: true,
        },
      }),
    ).catch((error: unknown) => {
      ocrInstance = null;
      throw error;
    });
  }
  return ocrInstance;
}

export function isOcrSupported(fileName: string, mimeType?: string) {
  return mimeType?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fileName);
}

async function resizeImage(blob: Blob, longEdge: number) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const ratio = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  if (ratio === 1) return bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建 OCR 预处理画布");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const resized = await createImageBitmap(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return resized;
}

export async function recognizeImage(blob: Blob, mode: OcrMode, page = 1): Promise<OcrPageResult> {
  const start = performance.now();
  const longEdge = OCR_MODE_OPTIONS.find((item) => item.id === mode)?.longEdge ?? 1280;
  const image = await resizeImage(blob, longEdge);
  try {
    const ocr = await getOcr();
    const [result] = await ocr.predict(image);
    const blocks: OcrBlock[] = result.items.map((item, index) => ({
      id: `block-${page}-${index}-${crypto.randomUUID()}`,
      text: item.text,
      confidence: item.score,
      polygon: item.poly.slice(0, 4).map(([x, y]) => [x, y]) as OcrBlock["polygon"],
      page,
    }));
    return {
      page,
      width: result.image.width,
      height: result.image.height,
      blocks,
      rawText: blocks.map((block) => block.text).join("\n"),
      processingTime: Math.round(performance.now() - start),
      status: "recognized",
    };
  } finally {
    image.close();
  }
}
