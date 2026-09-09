import { useLocation } from "react-router";
import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import type { Route } from "./+types/collect";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { getLocale, t } from "../lib/i18n";
import type { RecentSession, Runtime, Session } from "../lib/types";
import { StatusTag } from "../components/common";
import { AppUtilities } from "../components/app-utilities";

const SessionView = lazy(() =>
  import("../components/session-view").then((module) => ({
    default: module.SessionView,
  })),
);
export async function clientLoader({
  request,
  params,
}: Route.ClientLoaderArgs) {
  if (params.runtime && !["codex", "cursor"].includes(params.runtime))
    throw new Response("Unknown runtime", { status: 404 });
  if (!params.threadID)
    return {
      kind: "list" as const,
      ...(await api<{
        sessions: RecentSession[];
        errors?: { runtime: string; message: string }[];
      }>("/api/sessions/recent", { signal: request.signal })),
    };
  const runtime = params.runtime as Runtime;
  let progress = false;
  try {
    progress =
      JSON.parse(
        sessionStorage.getItem(
          "threadline-session:" + runtime + ":" + params.threadID,
        ) || "{}",
      ).includeProgress === true;
  } catch {
    /* default */
  }
  const { session } = await api<{ session: Session }>(
    `/api/${runtime}/sessions/${encodeURIComponent(params.threadID)}${progress ? "?progress=1" : ""}`,
    { signal: request.signal },
  );
  return { kind: "session" as const, session, runtime };
}
export default function Collect({ loaderData }: Route.ComponentProps) {
  return loaderData.kind === "list" ? (
    <SessionList data={loaderData} />
  ) : (
    <Suspense fallback={<p role="status">{t("正在读取…")}</p>}>
      <SessionView
        key={loaderData.runtime + loaderData.session.id}
        initial={loaderData.session}
        runtime={loaderData.runtime}
      />
    </Suspense>
  );
}
function SessionList({
  data,
}: {
  data: {
    sessions: RecentSession[];
    errors?: { runtime: string; message: string }[];
  };
}) {
  const app = useApp();
  const [query, setQuery] = useState(""),
    [runtime, setRuntime] = useState("all"),
    [limit, setLimit] = useState(6);
  const search = useRef<HTMLInputElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (new URLSearchParams(location.search).get("search") === "1")
      search.current?.focus();
  }, [location.key, location.search]);
  const filtered = data.sessions.filter(
    (session) =>
      (runtime === "all" || session.runtime === runtime) &&
      session.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section
      id="session-view"
      className="session-view choosing-session"
      aria-label={t("收录对话")}
    >
      <div className="session-shell">
        <div className="session-top">
          <div className="session-brand">
            <img
              className="header-brand-icon"
              src="/assets/threadline-icon.png"
              alt=""
            />
            <span className="session-wordmark">
              Thread<em>line</em>
            </span>
          </div>
          <div className="dialog-head">
            <h2>{t("收录对话")}</h2>
            <AppUtilities
              openInRuntime={app.openInRuntime}
              history={app.openHistory}
            />
          </div>
          <div className="session-description-row">
            <p className="session-subtitle">
              {t("选择要收录的会话，让值得记录的讨论继续发挥作用。")}
            </p>
            <button
              className="tool session-manual-add"
              onClick={() => app.capture()}
            >
              {t("手动添加 ↗")}
            </button>
          </div>
        </div>
        <div className="session-messages">
          <div className="session-search-row">
            <input
              ref={search}
              className="topic-select"
              aria-label={t("搜索本机会话")}
              placeholder={t("搜索会话名称")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(6);
              }}
            />
            <select
              className="runtime-filter"
              aria-label={t("按 Runtime 筛选会话")}
              value={runtime}
              onChange={(event) => {
                setRuntime(event.target.value);
                setLimit(6);
              }}
            >
              <option value="all">{t("全部 Runtime")}</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
          <div className="session-choices">
            {filtered.slice(0, limit).map((session) => (
              <SessionChoice
                key={session.runtime + session.id}
                session={session}
                open={() =>
                  app.go(
                    `/collect/${session.runtime}/${encodeURIComponent(session.id)}`,
                  )
                }
              />
            ))}
            {filtered.length > limit ? (
              <button className="tool" onClick={() => setLimit(limit + 6)}>
                {t("显示更多会话")}
              </button>
            ) : null}
          </div>
          {data.errors
            ?.filter((error) => runtime === "all" || error.runtime === runtime)
            .map((error) => (
              <p className="session-errors" key={error.runtime}>
                {error.runtime} · {error.message}
              </p>
            ))}
          {!filtered.length ? (
            <p className="session-guide">
              {query
                ? t("没有匹配的会话。")
                : t("没有找到本机会话，可通过「手动添加」收录。")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
const SessionChoice = memo(function SessionChoice({
  session,
  open,
}: {
  session: RecentSession;
  open(): void;
}) {
  const [detail, setDetail] = useState<Session | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ session: Session }>(
      `/api/${session.runtime}/sessions/${encodeURIComponent(session.id)}`,
      { signal: controller.signal },
    )
      .then((result) => setDetail(result.session))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [session.runtime, session.id]);
  return (
    <button className="session-choice" onClick={open}>
      <strong>
        {session.title}
        {detail ? <StatusTag status={detail.status} /> : null}
      </strong>
      <span>
        {session.updatedAt
          ? new Date(session.updatedAt).toLocaleString(getLocale())
          : ""}
      </span>
      <span className="runtime-badge">
        {session.runtime === "cursor" ? "Cursor" : "Codex"}
      </span>
      <p className="session-list-preview">
        {failed
          ? t("本机暂时无法读取，可选择其他会话")
          : detail?.messages
              .at(-1)
              ?.text.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
              .replace(/[#*`>|]/g, "")
              .replace(/\s+/g, " ")
              .slice(0, 110) || t("暂无完整消息")}
      </p>
    </button>
  );
});
