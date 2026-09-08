/**
 * Desktop release builds set this via Vite `define` so the packaged app
 * starts without the Macau sample workspace / demo overlays.
 */
declare const __INS_CLEAN_START__: boolean | undefined;

export const INS_CLEAN_START =
  typeof __INS_CLEAN_START__ !== "undefined" && __INS_CLEAN_START__ === true;
