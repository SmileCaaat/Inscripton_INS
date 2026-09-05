export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function nativeFilePath(file: File) {
  const value = (file as File & { path?: string }).path;
  return value?.trim() ? value : undefined;
}

export function replacePathFileName(fullPath: string, nextName: string) {
  const match = fullPath.match(/^(.*[\\/])/);
  return match ? `${match[1]}${nextName}` : nextName;
}
