export type InsDesktopBridge = {
  isDesktop: true;
  platform: string;
  versions: {
    electron: string;
    chrome: string;
  };
  chooseDirectory: () => Promise<string | null>;
  revealInFolder: (
    filePath: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  ensureDir: (root: string, relativePath: string) => Promise<string>;
  writeFile: (
    root: string,
    relativePath: string,
    data: ArrayBuffer,
  ) => Promise<string>;
  renameFile: (
    root: string,
    fromRelative: string,
    toRelative: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
};

declare global {
  interface Window {
    insDesktop?: InsDesktopBridge;
  }
}

export function getDesktopBridge() {
  return typeof window === "undefined" ? undefined : window.insDesktop;
}
