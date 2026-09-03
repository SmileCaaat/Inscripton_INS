# INS bundled OCR models

These PP-OCRv5 mobile inference archives are application resources, not runtime downloads.

- `PP-OCRv5_mobile_det_onnx_infer.tar`
- `PP-OCRv5_mobile_rec_onnx_infer.tar`

They are loaded only through `/ocr-models/` by `app/ocr/ocr-service.ts`. Do not rename or gzip the archives: PaddleOCR.js requires uncompressed ustar `.tar` files that contain `inference.onnx` and `inference.yml`.

The model source is the PaddlePaddle official inference-model distribution. The models are included so classroom machines can run OCR with no network connection.
