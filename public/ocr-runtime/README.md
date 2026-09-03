# INS bundled OCR runtime

These files are copied from the `onnxruntime-web` dependency used by PaddleOCR.js:

- `ort-wasm-simd-threaded.wasm`
- `ort-wasm-simd-threaded.jsep.mjs`
- `ort-wasm-simd-threaded.jsep.wasm`

They are served locally from `/ocr-runtime/`; the OCR service must not fall back to a CDN. The JSEP module is an ONNX Runtime loader dependency, not a request for WebGPU.
