export type OcrMode = "fast" | "standard" | "quality";

export type OcrPageStatus =
  | "pending"
  | "processing"
  | "recognized"
  | "reviewed"
  | "error";

export type OcrBlock = {
  id: string;
  text: string;
  confidence: number;
  polygon: [[number, number], [number, number], [number, number], [number, number]];
  page?: number;
};

export type OcrPageResult = {
  page: number;
  width: number;
  height: number;
  blocks: OcrBlock[];
  rawText: string;
  correctedText?: string;
  processingTime?: number;
  status: OcrPageStatus;
  error?: string;
};

export type OcrDocumentResult = {
  id: string;
  assetId: string;
  assetName: string;
  createdAt: string;
  updatedAt: string;
  model: "PP-OCRv5_mobile";
  mode: OcrMode;
  pages: OcrPageResult[];
};

export const OCR_MODE_OPTIONS: Array<{ id: OcrMode; label: string; longEdge: number }> = [
  { id: "fast", label: "快速", longEdge: 960 },
  { id: "standard", label: "标准", longEdge: 1280 },
  { id: "quality", label: "高清", longEdge: 1600 },
];
