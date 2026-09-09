import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { api, post } from "../lib/api";
import { useApp } from "../lib/app-context";
import { count, getLocale, t, tr } from "../lib/i18n";
import type { Clip, Message, Runtime, Session, Snapshot } from "../lib/types";
import { ErrorText, ProjectContext, TopicSelect } from "./common";
import { StatusTag } from "./common";
import { Markdown } from "./markdown";
import { Modal } from "./modal";
const ShareDialog = lazy(() =>
  import("./share-dialog").then((module) => ({ default: module.ShareDialog })),
);

export function SessionView({
  initial,
  runtime,
}: {
  initial: Session;
  runtime: Runtime;
}) {
  const app = useApp();
  const key = runtime + ":" + initial.id;
  const [draft, setDraft] = useState(() => app.getSessionDraft(key));
  const [session, setSession] = useState(initial),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [save, setSave] = useState(false),
    [error, setError] = useState<unknown>();
  const [shareBusy, setShareBusy] = useState(false);
  const [share, setShare] = useState<Snapshot | null>(null),
    [receipt, setReceipt] = useState<Clip | null>(null);
  const list = useRef<HTMLDivElement>(null),
    head = useRef<HTMLDivElement>(null),
    firstLoad = useRef(true);
  const live = useRef({ busy, save, draft });
  live.current = { busy, save, draft };
  const [refreshKey, setRefreshKey] = useState(0);
  const blocker = useBlocker(busy || shareBusy);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (busy || shareBusy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [busy, shareBusy]);
  useEffect(() => {
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);
  useEffect(() => {
    app.saveSessionDraft(key, draft);
  }, [key, draft, app.saveSessionDraft]);
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    });
    return () => cancelAnimationFrame(timer);
  }, []);
  useEffect(() => {
    let active = true,
      pending = false;
    const controller = new AbortController();
    const refresh = async (quiet = true) => {
      if (
        pending ||
        live.current.busy ||
        live.current.save ||
        (quiet && document.visibilityState !== "visible")
      )
        return;
      pending = true;
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const { session: next } = await api<{ session: Session }>(
          `/api/${runtime}/sessions/${encodeURIComponent(initial.id)}${draft.includeProgress ? "?progress=1" : ""}`,
          { signal: controller.signal },
        );
        if (!active) return;
        setSession((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
        setDraft((previous) => ({
          ...previous,
          selected: previous.selected.filter((id) =>
            next.messages.some((message) => message.id === id),
          ),
        }));
      } catch (error) {
        if (active && !quiet) setError(error);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    if (firstLoad.current) firstLoad.current = false;
    else void refresh(false);
    const visible = () => {
      void refresh();
    };
    const timer = setInterval(visible, 5000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [initial.id, runtime, draft.includeProgress, refreshKey]);
  const selected = session.messages.filter((message) =>
    draft.selected.includes(message.id),
  );
  const snapshot = (): Snapshot => ({
    runtime,
    threadID: session.id,
    messageIDs: selected.map((message) => message.id),
    fingerprints: Object.fromEntries(
      selected.map((message) => [message.id, message.fingerprint]),
    ),
    includeProgress: draft.includeProgress,
  });
  async function importSelection(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ clip: Clip; duplicate: boolean }>(
        `/api/${runtime}/import`,
        {
          ...snapshot(),
          title: draft.title || session.title,
          note: draft.note,
          topicID: draft.topicID,
        },
      );
      const chosen = new Set(draft.selected);
      setSession((previous) => ({
        ...previous,
        messages: previous.messages.map((message) =>
          chosen.has(message.id) ? { ...message, saved: true } : message,
        ),
      }));
      setDraft((previous) => ({
        ...previous,
        selected: [],
        title: "",
        note: "",
      }));
      setSave(false);
      setReceipt(result.clip);
      await app.refresh();
      app.notify(
        result.duplicate
          ? t("这些消息已经记录")
          : tr(
              `已记录 ${selected.length} 条消息`,
              `${selected.length} messages collected`,
            ),
      );
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="session-view"
      className={`session-view ${selected.length ? "has-selection" : ""}`}
      aria-label={t("收录对话")}
    >
      <div className="session-shell">
        <div className="session-top" ref={head}>
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
            <button
              className="tool session-back"
              aria-label={t("返回全部会话")}
              onClick={() => app.go("/collect")}
            >
              ←
            </button>
            <h2>{session.title}</h2>
            <details className="session-more">
              <summary aria-label={t("更多会话操作")}>•••</summary>
              <div className="session-more-body">
                <label>
                  <input
                    type="checkbox"
                    checked={draft.includeProgress}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        includeProgress: event.target.checked,
                      }))
                    }
                  />
                  {t("包含过程消息")}
                </label>
                <button
                  className="tool"
                  disabled={busy}
                  onClick={() => {
                    if (list.current)
                      list.current.scrollTop = list.current.scrollHeight;
                  }}
                >
                  {t("跳到最新 ↓")}
                </button>
                <button
                  className="tool"
                  disabled={busy || loading}
                  onClick={() => setRefreshKey((value) => value + 1)}
                >
                  {t("刷新")}
                </button>
                <button
                  className="tool"
                  onClick={() => app.capture(draft.topicID)}
                >
                  {t("手动添加 ↗")}
                </button>
                <button className="tool" onClick={() => app.openCarry()}>
                  {t("使用对话")}
                </button>
                <button className="tool" onClick={app.openHistory}>
                  {t("分享记录")}
                </button>
                <button
                  className="tool"
                  onClick={() => void app.openInRuntime("codex")}
                >
                  {t("在 Codex 中打开 ↗")}
                </button>
                <button
                  className="tool"
                  onClick={() => void app.openInRuntime("cursor")}
                >
                  {t("在 Cursor 中打开 ↗")}
                </button>
              </div>
            </details>
          </div>
          <div className="session-subtitle">
            {count(session.messages.length)} · {t("选择值得记录的内容")}{" "}
            <StatusTag status={session.status} />
          </div>
          <ErrorText error={!save ? error : null} />
        </div>
        <div
          className="session-messages"
          ref={list}
          onScroll={(event) => {
            const progress = Math.min(
              1,
              Math.max(0, event.currentTarget.scrollTop) / 120,
            );
            head.current?.style.setProperty(
              "--collection-collapse",
              String(progress),
            );
          }}
        >
          {session.messages.map((message, index) => (
            <MessageCard
              key={message.id}
              message={message}
              runtime={runtime}
              thread={session.id}
              chosen={draft.selected.includes(message.id)}
              disabled={busy || loading}
              annotations={
                session.messages
                  .slice(0, index)
                  .findLast((message) => message.annotations?.length)
                  ?.annotations
              }
              select={() =>
                setDraft((previous) => ({
                  ...previous,
                  selected: previous.selected.includes(message.id)
                    ? previous.selected.filter((id) => id !== message.id)
                    : [...previous.selected, message.id],
                }))
              }
            />
          ))}
          {!session.messages.length ? (
            <p className="session-guide">
              {t("这条会话暂时没有可保存的完整消息。完成回答后点击刷新。")}
            </p>
          ) : null}
        </div>
        {selected.length ? (
          <div className="session-bottom">
            <div className="selection-footer">
              <span className="selection-status">{t`已选 ${selected.length} 条`}</span>
              <button
                className="tool"
                disabled={busy}
                onClick={() =>
                  setDraft((previous) => ({ ...previous, selected: [] }))
                }
              >
                {t("取消选择")}
              </button>
              <div className="selection-actions">
                <button
                  className="tool"
                  aria-label={t("分享所选讨论")}
                  disabled={busy || loading}
                  onClick={() => setShare(snapshot())}
                >
                  {t("分享")}
                </button>
                <button
                  className="primary"
                  id="save-session"
                  disabled={busy || loading}
                  onClick={() => {
                    setError(null);
                    setSave(true);
                  }}
                >
                  {t("记录")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {receipt ? (
          <div className="session-receipt" role="status">
            <span>{t("已收录")}</span>
            <button
              className="tool"
              onClick={() => app.go("/notes/" + receipt.id)}
            >
              {t("查看笔记 →")}
            </button>
            <button
              className="tool"
              aria-label={t("关闭")}
              onClick={() => setReceipt(null)}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
      {save ? (
        <Modal
          id="save-session-dialog"
          title={t("记录这次进展")}
          onClose={() => setSave(false)}
          busy={busy}
        >
          <form onSubmit={importSelection}>
            <p className="dialog-hint">
              {t("将按对话顺序记录 ")}
              {count(selected.length)}
            </p>
            <ProjectContext source={session} />
            <details className="session-optional">
              <summary>{t("补充标题、判断或归属 · 可选")}</summary>
              <label className="field-label" htmlFor="session-title">
                {t("标题")}
              </label>
              <input
                id="session-title"
                className="session-title-input"
                value={draft.title || session.title}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                disabled={busy}
              />
              <label className="field-label" htmlFor="session-note">
                {t("我的判断与适用条件")}
              </label>
              <textarea
                id="session-note"
                className="capture-input"
                value={draft.note}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    note: event.target.value,
                  }))
                }
                disabled={busy}
              />
              <label className="field-label" htmlFor="session-topic">
                {t("归入思路")}
              </label>
              <TopicSelect
                id="session-topic"
                topics={app.library.topics}
                value={draft.topicID}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    topicID: event.target.value,
                  }))
                }
                disabled={busy}
              />
            </details>
            <ErrorText error={error} />
            <div className="dialog-bottom">
              <button
                className="primary"
                id="confirm-save-session"
                disabled={busy}
              >
                {busy ? t("正在记录…") : t("确认记录")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      <Suspense fallback={null}>
        {share ? (
          <ShareDialog
            snapshot={share}
            onClose={() => setShare(null)}
            onBusy={setShareBusy}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
const MessageCard = memo(function MessageCard({
  message,
  runtime,
  thread,
  chosen,
  disabled,
  select,
  annotations,
}: {
  message: Message;
  runtime: Runtime;
  thread: string;
  chosen: boolean;
  disabled: boolean;
  select(): void;
  annotations?: Message["annotations"];
}) {
  const [expanded, setExpanded] = useState(false);
  const role =
    message.role === "user"
      ? t("你")
      : (runtime === "cursor" ? "Cursor" : "Codex") +
        (message.phase === "commentary" ? t(" · 过程") : t(" · 回答"));
  return (
    <article
      className={`message-card message-${message.role} ${chosen ? "chosen" : ""}`}
      data-message-id={message.id}
    >
      <button
        className="tool message-label message-select"
        type="button"
        aria-pressed={chosen}
        aria-label={t("选择") + " " + role + " " + message.text.slice(0, 36)}
        onClick={select}
        disabled={disabled}
      >
        <img
          className={`message-avatar avatar-${message.role === "user" ? "user" : runtime}`}
          src={`/assets/${message.role === "user" ? "user" : runtime}-avatar.png`}
          alt=""
        />
        <span className="message-role">{role}</span>
        {message.saved ? (
          <span className="message-saved-tag">{t("已记录")}</span>
        ) : null}
        <time className="message-date">
          {message.timestamp
            ? new Date(message.timestamp).toLocaleString(getLocale(), {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </time>
        <span className="message-selection-state">
          {chosen ? t("已选") : t("选择")}
        </span>
      </button>
      <div
        className={
          message.text.length > 650 && !expanded ? "message-collapse" : ""
        }
      >
        <Markdown
          text={message.text}
          thread={thread}
          runtime={runtime}
          annotations={annotations}
        />
      </div>
      {message.text.length > 650 ? (
        <button
          className="tool message-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t("收起 ↑") : t("展开完整内容 ↓")}
        </button>
      ) : null}
    </article>
  );
});
