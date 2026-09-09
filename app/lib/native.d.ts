import type { Runtime } from "./types";
export interface NativeCommands {
  capture(text?: string): void;
  collect(): void;
  library(): void;
  search(): void;
  settings(): void;
  openInRuntime(runtime?: Runtime): void;
}
declare global {
  interface Window {
    Threadline?: NativeCommands;
    webkit?: {
      messageHandlers?: Record<string, { postMessage(message: unknown): void }>;
    };
  }
}
