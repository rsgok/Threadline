import { createContext, useContext } from "react";
import type { Library, Runtime, Topic } from "./types";

export interface SessionDraft {
  selected: string[];
  title: string;
  note: string;
  topicID: string;
  includeProgress: boolean;
}
export interface AppContextValue {
  library: Library;
  refresh(): Promise<void>;
  go(path: string): void;
  href(path: string): string;
  notify(text: string, error?: boolean): void;
  capture(topicID?: string, text?: string, image?: File): void;
  editTopic(topic?: Topic): void;
  carry: string[];
  toggleCarry(id: string): void;
  openCarry(ids?: string[]): void;
  copy(text: string): Promise<void>;
  openInRuntime(runtime?: Runtime): Promise<void>;
  openHistory(): void;
  getSessionDraft(key: string): SessionDraft;
  saveSessionDraft(key: string, value: SessionDraft): void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("Missing application shell");
  return value;
}
