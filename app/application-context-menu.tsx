"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

export type ApplicationContextMenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
};

type ApplicationContextMenuProps = {
  x: number;
  y: number;
  items: ApplicationContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
};

export function ApplicationContextMenu({
  x,
  y,
  items,
  onClose,
  ariaLabel = "快捷操作菜单",
}: ApplicationContextMenuProps) {
  const position = useMemo(() => {
    const width = 238;
    const estimatedHeight = Math.min(430, items.length * 34 + 18);
    const padding = 8;
    return {
      left: Math.max(
        padding,
        Math.min(x, window.innerWidth - width - padding),
      ),
      top: Math.max(
        padding,
        Math.min(y, window.innerHeight - estimatedHeight - padding),
      ),
    };
  }, [items.length, x, y]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnViewportChange = () => onClose();
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("blur", closeOnViewportChange);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("blur", closeOnViewportChange);
    };
  }, [onClose]);

  return createPortal(
    <>
      <button
        type="button"
        className="application-context-backdrop"
        aria-label="关闭快捷操作菜单"
        onContextMenu={(event) => event.preventDefault()}
        onClick={onClose}
      />
      <div
        className="application-context-menu"
        role="menu"
        aria-label={ariaLabel}
        style={position}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {items.map((item) =>
          item.separator ? (
            <div
              key={item.id}
              className="application-context-separator"
              role="separator"
            />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={item.danger ? "danger" : undefined}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  );
}
