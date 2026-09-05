declare module "vosviewer-online" {
  import type { ComponentType } from "react";

  export const VOSviewerOnline: ComponentType<{
    data?: unknown;
    parameters?: Record<string, unknown>;
  }>;
}
