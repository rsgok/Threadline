import { useEffect, useState } from "react";
import { errorMessage } from "../lib/api";
import { getLocale, t, tr } from "../lib/i18n";
import type { Project, Topic } from "../lib/types";

const paths = {
  search: "M16 16 21 21 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  sidebar: "M3 4h18v16H3z M9 4v16",
  chat: "M4 4h16v13H9l-5 4V4 M8 9h8 M8 13h5",
  thoughts:
    "M6 7v10 M8 5h3a7 7 0 0 1 7 5 M8 19h3a7 7 0 0 0 7-5 M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  settings:
    "M9 3 8 6 5 5 3 9l2 2v2l-2 2 2 4 3-1 1 3h4l1-3 3 1 2-4-2-2v-2l2-2-2-4-3 1-1-3Z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  export: "M12 15V3 M8 7l4-4 4 4 M5 12v8h14v-8",
} as const;
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
export function ErrorText({ error }: { error: unknown }) {
  return error ? (
    <p className="dialog-error" role="alert">
      {errorMessage(error)}
    </p>
  ) : null;
}
export function TopicSelect({
  topics,
  ...props
}: { topics: Topic[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="topic-select" {...props}>
      <option value="">{t("未分类")}</option>
      {topics.map((topic) => (
        <option key={topic.id} value={topic.id}>
          {topic.title}
        </option>
      ))}
    </select>
  );
}
export function ProjectContext({
  source,
}: {
  source?: { cwd?: string; project?: Project | null };
}) {
  if (!source?.cwd && !source?.project) return null;
  return (
    <details className="project-context">
      <summary>
        {source.project ? t("项目 · ") + source.project.name : t("工作目录")}
      </summary>
      {source.project ? (
        <div>
          {t("项目目录")} <code>{source.project.root}</code>
        </div>
      ) : null}
      {source.cwd ? (
        <div>
          {t("工作目录")} <code>{source.cwd}</code>
        </div>
      ) : null}
    </details>
  );
}
export function StatusTag({ status }: { status?: string }) {
  return (
    <span
      className={`session-status-tag ${status || "unknown"}`}
      title={t("依据本机会话记录，不代表进程实时在线状态")}
    >
      {{
        open: t("本轮未结束"),
        complete: t("本轮已完成"),
        interrupted: t("已中断"),
      }[status || ""] || t("状态未知")}
    </span>
  );
}
export function dateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(getLocale(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
export function Loading() {
  return (
    <p className="session-guide" role="status">
      {tr("正在读取…", "Loading…")}
    </p>
  );
}
