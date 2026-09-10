export type Runtime = "codex" | "cursor";
export type Locale = "zh-CN" | "en";
export type Language = Locale | "system";
export interface Project {
  name: string;
  root: string;
}
export interface Attachment {
  id: string;
  name: string;
  path: string;
  kind: "image" | "file";
  available: boolean;
  selected?: boolean;
  size: number;
  problem?: string;
  ordinal?: number;
}
export interface Provenance {
  runtime?: Runtime;
  threadID?: string;
  threadTitle?: string;
  cwd?: string;
  project?: Project | null;
  containsImageReferences?: boolean;
}
export interface Clip {
  id: string;
  title: string;
  body: string;
  note: string;
  question: string;
  sourceURL: string;
  source: string;
  topicID: string;
  version: string;
  date: string;
  createdAt: number;
  updatedAt: number;
  hasImage: boolean;
  attachment?: string;
  ocrStatus?: string;
  provenance?: Provenance;
  assets?: { name: string; originalPath: string; storedName: string }[];
  assetWarnings?: { name: string; reason: string }[];
  reviewHistory?: {
    status: "outdated" | "updated";
    reason: string;
    at: string;
  }[];
  review?: { status: "outdated" | "updated"; reason: string; at: string };
}
export type NoteFields = Pick<
  Clip,
  "title" | "body" | "note" | "question" | "sourceURL" | "topicID"
>;
export interface Topic {
  id: string;
  title: string;
  goal: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}
export interface Library {
  clips: Clip[];
  topics: Topic[];
  total: number;
  query: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  fingerprint: string;
  phase?: string;
  timestamp?: string;
  saved: boolean;
  annotations?: { text: string; comment: string }[];
}
export interface Session {
  id: string;
  title: string;
  messages: Message[];
  status?: string;
  cwd?: string;
  project?: Project | null;
}
export interface RecentSession {
  id: string;
  title: string;
  runtime: Runtime;
  updatedAt?: string;
}
export interface Snapshot {
  runtime: Runtime;
  threadID: string;
  messageIDs: string[];
  fingerprints: Record<string, string>;
  includeProgress: boolean;
}
export type RelationType = "supports" | "extends" | "contradicts" | "related";
export interface Relation {
  id: string;
  from: string;
  to: string;
  type: RelationType;
  reason: string;
  fromQuote: string;
  toQuote: string;
  status: "suggested" | "confirmed" | "dismissed";
  stale?: boolean;
  revision: number;
}
export interface AnalysisJob {
  status: "running" | "completed" | "failed";
  count?: number;
  error?: string;
}
export interface RelationsResult {
  relations: Relation[];
  job?: AnalysisJob;
}
export interface ShareStep {
  id: string;
  label: string;
  status: "sent" | "pending" | "sending" | "failed" | "uncertain";
  error?: string;
}
export interface ShareJob {
  historyKind?: "activity";
  action?: string;
  status?: string;
  detail?: string;
  createdAt?: number;
  id: string;
  title: string;
  platform: string;
  target: string;
  text: string;
  messages: Message[];
  attachments: Attachment[];
  steps: ShareStep[];
  expired?: boolean;
  sending?: boolean;
}
export interface ShareStatus {
  slack: { connected: boolean; team?: string; selfUserId?: string };
  discord: { connected: boolean; name?: string; channel?: string };
}
export interface CardTheme {
  id: string;
  name: string;
  description: string;
  paper: string;
  ink: string;
  accent: string;
  soft: string;
  layout: string;
}
export interface RenderState {
  phase: string;
  message?: string;
  percent?: number;
  total?: number;
  completed?: number;
}
export interface FeishuStatus {
  connected: boolean;
  ready: boolean;
  privateReady: boolean;
  appId?: string;
  recoveryAppId?: string;
  userAuthorized?: boolean;
  userName?: string;
  botName?: string;
  missingBotScopes?: string[];
  missingScopes?: string[];
  permissionUrl?: string;
  uploadPermissionUrl?: string;
  consoleUrl?: string;
  connectionError?: string;
  botScopeError?: string;
  job?: {
    kind: string;
    status: string;
    qr?: string;
    url?: string;
    message?: string;
  };
}
export interface FeishuPreview {
  id: string;
  text: string;
  attachments: Attachment[];
  count: number;
  cardCount: number;
  fileCount: number;
}
