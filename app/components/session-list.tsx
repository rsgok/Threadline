import { runtimeNames, runtimes } from "../lib/runtimes";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { api, post, errorMessage } from "../lib/api";
import { useApp } from "../lib/app-context";
import { getLocale, t, tr } from "../lib/i18n";
import type { RecentSession, Session } from "../lib/types";
import { CodexThreadLink } from "./codex-thread-link";
import { WindowHeading } from "./window-heading";
import { Icon } from "./common";

export type Organization = {
  tags: { name: string; color: string }[];
  sessions: Record<string, { pinned: boolean; tags: string[] }>;
};
const keyOf = (session: RecentSession) => session.runtime + ":" + session.id;
const colors = ["sage", "blue", "purple", "amber", "coral", "gray"];
const colorLabels = () => [
  tr("苔绿", "Sage"),
  tr("雾蓝", "Blue"),
  tr("淡紫", "Purple"),
  tr("琥珀", "Amber"),
  tr("陶红", "Coral"),
  tr("石灰", "Gray"),
];

export type SessionIndexData = {
  sessions: RecentSession[];
  details: Record<string, Session | null>;
  organization: Organization;
  errors?: { runtime: string; message: string }[];
  revision: string;
  initialized: boolean;
  syncing: boolean;
};

export function SessionList({ data: initialData }: { data: SessionIndexData }) {
  const [data, setData] = useState(initialData);
  const [pendingIndex, setPendingIndex] = useState<SessionIndexData | null>(null);
  const lastFetched = useRef(initialData.revision);
  const browser = useRef<HTMLDivElement>(null);
  const app = useApp(),
    location = useLocation();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [runtime, setRuntime] = useState("all"),
    [scope, setScope] = useState("all"),
    [tagFilter, setTagFilter] = useState(""),
    [grouped, setGrouped] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [organization, setOrganization] = useState<Organization>(data.organization),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false);
  const details = data.details;
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [color, setColor] = useState("sage"),
    [editingTag, setEditingTag] = useState("");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("search") === "1")
      search.current?.focus();
  }, [location.key, location.search]);
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      api<Organization>("/api/sessions/organization", {
        signal: controller.signal,
      })
        .then((value) => {
          setOrganization(value);
          setLoadError("");
        })
        .catch((error) => {
          if (!controller.signal.aborted) setLoadError(errorMessage(error));
        });
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polling = false;
    const check = async () => {
      if (polling || document.hidden || controller.signal.aborted) return;
      polling = true;
      try {
        const status = await api<Pick<SessionIndexData, "revision" | "initialized">>(
          "/api/sessions/index/status", { signal: controller.signal });
        if (status.revision === data.revision && status.initialized === data.initialized) {
          setPendingIndex(null);
          lastFetched.current = status.revision;
        } else if (status.revision !== lastFetched.current || status.initialized !== data.initialized) {
          const next = await api<SessionIndexData>("/api/sessions/index", { signal: controller.signal });
          if (controller.signal.aborted) return;
          lastFetched.current = next.revision;
          if (!data.initialized) {
            setData(next); setOrganization(next.organization);
          } else {
            setPendingIndex(next);
          }
        }
        setLoadError("");
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      } finally {
        polling = false;
      }
    };
    const tick = async () => {
      await check();
      if (!controller.signal.aborted) timer = setTimeout(tick, 5000);
    };
    void tick();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller.abort(); clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [data.revision, data.initialized]);
  function applyIndex() {
    if (!pendingIndex) return;
    const top = browser.current?.scrollTop || 0;
    const available = new Set(pendingIndex.sessions.map(keyOf));
    setSelected(previous => new Set([...previous].filter(key => available.has(key))));
    setData(pendingIndex); setPendingIndex(null);
    requestAnimationFrame(() => { if (browser.current) browser.current.scrollTop = top; });
  }
  async function change(command: Record<string, unknown>) {
    setBusy(true);
    try {
      const next = await post<Organization>(
        "/api/sessions/organization",
        command,
      );
      setOrganization(next);
      return true;
    } catch (error) {
      app.notify(errorMessage(error), true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const filtered = data.sessions
    .filter((session) => {
      const entry = organization?.sessions[keyOf(session)],
        tags = entry?.tags || [];
      return (
        (runtime === "all" || session.runtime === runtime) &&
        (session.title + " " + tags.join(" "))
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()) &&
        (!tagFilter || tags.includes(tagFilter)) &&
        (scope === "all" || (scope === "pin" ? entry?.pinned : !tags.length))
      );
    })
    .sort(
      (a, b) =>
        Number(organization?.sessions[keyOf(b)]?.pinned || false) -
        Number(organization?.sessions[keyOf(a)]?.pinned || false),
    );
  const visible = filtered;
  const projectKey = (session: RecentSession) =>
    details[keyOf(session)]?.project?.root ||
    details[keyOf(session)]?.cwd ||
    "";
  const projectGroups = new Map<string, RecentSession[]>();
  for (const session of visible) {
    const key = grouped ? projectKey(session) : "all";
    const entries = projectGroups.get(key);
    if (entries) entries.push(session); else projectGroups.set(key, [session]);
  }
  const allPinned = [...selected].every(
    (key) => organization?.sessions[key]?.pinned,
  );
  function toggle(key: string) {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
    if (!next.size) setEditing(false);
  }
  function resetFilter(action: () => void) {
    action();
    setSelected(new Set());
    setEditing(false);
  }
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
              src="/assets/threadline-icon.png?v=sage-1"
              alt=""
            />
            <span className="session-wordmark">
              Thread<em>line</em>
            </span>
          </div>
          <WindowHeading>
            <div className="dialog-head collection-heading">
              <h2>{t("收录对话")}</h2>

            </div>
          </WindowHeading>
        </div>
        <div className="session-messages conversation-browser" ref={browser}>
          <div className="session-search-row">
            <input
              ref={search}
              className="topic-select"
              aria-label={t("搜索本机会话")}
              placeholder={tr("搜索标题或标签", "Search titles or tags")}
              value={query}
              onChange={(event) =>
                resetFilter(() => setQuery(event.target.value))
              }
            />
            <button className="secondary" aria-expanded={filtersOpen} aria-controls="conversation-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}>
              {tr("筛选", "Filters")}{runtime !== "all" || scope !== "all" || tagFilter || !grouped ? " ·" : ""}
            </button>
          </div>
          {filtersOpen && <div id="conversation-filters" className="conversation-filters">
            <label>{tr("来源", "Source")}
              <select aria-label={t("按 Runtime 筛选会话")} value={runtime}
                onChange={event => resetFilter(() => setRuntime(event.target.value))}>
                <option value="all">{t("全部 Runtime")}</option>
                {runtimes.map(value => <option key={value} value={value}>{runtimeNames[value]}</option>)}
              </select>
            </label>
            <label>{tr("范围", "Scope")}
              <select aria-label={tr("对话范围", "Conversation scope")} value={scope}
                onChange={event => resetFilter(() => setScope(event.target.value))}>
                <option value="all">{t("全部对话")}</option>
                <option value="pin">{tr("已置顶", "Pinned")}</option>
                <option value="untagged">{tr("未打标签", "Untagged")}</option>
              </select>
            </label>
            <label>{tr("标签", "Tag")}
              <select aria-label={tr("标签筛选", "Filter by tag")} value={tagFilter}
                onChange={event => resetFilter(() => setTagFilter(event.target.value))}>
                <option value="">{tr("全部标签", "All tags")}</option>
                {organization.tags.map(tag => <option key={tag.name}>{tag.name}</option>)}
              </select>
            </label>
            <label>{tr("排列", "Layout")}
              <select aria-label={tr("对话排列", "Conversation layout")} value={grouped ? "project" : "recent"}
                onChange={event => setGrouped(event.target.value === "project")}>
                <option value="project">{tr("按项目", "By project")}</option>
                <option value="recent">{tr("按最近时间", "By recent activity")}</option>
              </select>
            </label>
            <button className="tool" onClick={() => resetFilter(() => {
              setRuntime("all"); setScope("all"); setTagFilter(""); setGrouped(true);
            })}>{tr("重置筛选", "Reset filters")}</button>
          </div>}
          {pendingIndex && <button className="secondary conversation-update" onClick={applyIndex}>
            {pendingIndex.sessions.some(next => !data.sessions.some(old => keyOf(old) === keyOf(next)))
              ? tr("有新对话，点击更新", "New conversations available")
              : tr("对话有更新，点击刷新", "Conversation updates available")}
          </button>}
          {!data.initialized && <div className="conversation-index-loading" role="status">
            <span>{tr("正在建立本机会话索引…", "Building the local conversation index…")}</span>
            <div aria-hidden="true" className="conversation-skeleton" />
            <div aria-hidden="true" className="conversation-skeleton" />
            <div aria-hidden="true" className="conversation-skeleton" />
          </div>}
          {loadError && (
            <p className="session-errors" role="alert">
              {loadError}
            </p>
          )}
          <div
            className={`session-choices conversation-choices ${selected.size ? "has-selection" : ""}`}
          >
            {[...projectGroups].map(([group, sessions]) => {
              const shown = grouped && !expanded.has(group) ? sessions.slice(0, 5) : sessions;
              return (
              <div key={group} className="conversation-group">
                {group !== "all" && (
                  <button
                    className="tool conversation-group-head"
                    aria-expanded={!collapsed.has(group)}
                    onClick={() =>
                      setCollapsed((old) => {
                        const next = new Set(old);
                        next.has(group) ? next.delete(group) : next.add(group);
                        return next;
                      })
                    }
                  >
                    <span className="conversation-group-icon"><Icon name="dir" /></span>
                    <span>{details[
                      keyOf(
                        sessions[0],
                      )
                    ]?.project?.name ||
                      group.split(/[\\/]/).filter(Boolean).at(-1) ||
                      tr("其他对话", "Other conversations")}</span>

                  </button>
                )}
                {!collapsed.has(group) &&
                  shown.map((session) => {
                      const key = keyOf(session),
                        detail = details[key],
                        entry = organization?.sessions[key];
                      const status = detail?.status || "unknown";
                      const statusLabel =
                        status === "complete"
                          ? t("本轮已完成")
                          : status === "open"
                            ? t("本轮未结束")
                            : status === "interrupted"
                              ? t("已中断")
                              : tr("状态未知", "Unknown status");
                      const preview =
                        detail === null
                          ? t("本机暂时无法读取，可选择其他会话")
                          : detail?.messages
                              .at(-1)
                              ?.text.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
                              .replace(/[#*`>|]/g, "")
                              .replace(/\s+/g, " ")
                              .slice(0, 160) ||
                            (detail
                              ? t("暂无完整消息")
                              : tr("正在读取摘要…", "Loading preview…"));
                      return (
                        <div
                          key={key}
                          className={`session-choice-row conversation-row ${selected.has(key) ? "chosen" : ""}`}
                        >
                          <button
                            className="tool conversation-select"
                            disabled={!organization || busy}
                            aria-label={
                              (selected.has(key)
                                ? tr("取消选择：", "Deselect: ")
                                : tr("选中：", "Select: ")) + session.title
                            }
                            aria-pressed={selected.has(key)}
                            title={
                              statusLabel +
                              " · " +
                              tr("点击多选", "Click to select")
                            }
                            onClick={() => toggle(key)}
                          >
                            <span
                              className={`conversation-dot ${status}`}
                              aria-label={statusLabel}
                            />
                            <span
                              className="conversation-check"
                              aria-hidden="true"
                            >
                              {selected.has(key) ? "✓" : ""}
                            </span>
                          </button>
                          <button
                            className="session-choice"
                            onClick={() =>
                              app.go(
                                `/collect/${session.runtime}/${encodeURIComponent(session.id)}`,
                              )
                            }
                          >
                            <strong>
                              {entry?.pinned && (
                                <span aria-label={tr("已置顶", "Pinned")}>
                                  ⌁{" "}
                                </span>
                              )}
                              {session.title}
                            </strong>
                            <time
                              dateTime={session.updatedAt}
                              title={
                                session.updatedAt
                                  ? new Date(session.updatedAt).toLocaleString(
                                      getLocale(),
                                    )
                                  : ""
                              }
                            >
                              {session.updatedAt
                                ? new Date(
                                    session.updatedAt,
                                  ).toLocaleDateString(getLocale(), {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : ""}
                            </time>
                          </button>
                          <div className="session-list-preview">
                            <span className="conversation-runtime">
                              {runtimeNames[session.runtime]}
                            </span>
                            {entry?.tags.slice(0, 1).map((name) => (
                              <button
                                key={name}
                                className={`tool conversation-tag tag-${organization?.tags.find((tag) => tag.name === name)?.color || "sage"}`}
                                onClick={() =>
                                  resetFilter(() => setTagFilter(name))
                                }
                              >
                                {name}
                              </button>
                            ))}
                            {entry && entry.tags.length > 1 && (
                              <small title={entry.tags.join(" · ")}>
                                +{entry.tags.length - 1}
                              </small>
                            )}
                            <span className="conversation-preview-text">
                              {preview}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                {grouped && !collapsed.has(group) && sessions.length > 5 ? <button
                  className="tool conversation-group-more"
                  aria-expanded={expanded.has(group)}
                  onClick={() => setExpanded(previous => {
                    const next = new Set(previous);
                    next.has(group) ? next.delete(group) : next.add(group);
                    return next;
                  })}
                >{expanded.has(group) ? tr("收起", "Show less") : tr("展开显示", "Show more")}</button> : null}
              </div>
            );})}

          </div>
          {data.errors
            ?.filter((error) => runtime === "all" || error.runtime === runtime)
            .map((error) => (
              <p className="session-errors" key={error.runtime + error.message}>
                {error.runtime} · {error.message}
              </p>
            ))}
          {data.initialized && !filtered.length && (
            <p className="session-guide">
              {query || scope !== "all" || tagFilter
                ? t("没有匹配的会话。")
                : tr("没有找到本机会话，可以在左侧添加笔记", "No local conversations found. Add a note from the sidebar")}
            </p>
          )}
        </div>
        {!!selected.size && (
          <div className="session-bottom conversation-bottom">
            {editing && (
              <section
                className="conversation-tag-editor"
                aria-label={tr("编辑标签", "Edit tags")}
              >
                <div className="conversation-tag-options">
                  {organization?.tags.map((tag) => {
                    const all = [...selected].every((key) =>
                      organization.sessions[key]?.tags.includes(tag.name),
                    );
                    return (
                      <button
                        disabled={busy}
                        key={tag.name}
                        className={`secondary conversation-tag tag-${tag.color}`}
                        aria-pressed={all}
                        onClick={() =>
                          void change({
                            action: all ? "removeTag" : "addTag",
                            keys: [...selected],
                            name: tag.name,
                          })
                        }
                      >
                        {tag.name}
                        {all ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
                <div className="conversation-color-editor">
                  <label>
                    {tr("标签颜色", "Tag color")}
                    <select
                      value={editingTag}
                      onChange={(event) => {
                        setEditingTag(event.target.value);
                        setColor(
                          organization?.tags.find(
                            (tag) => tag.name === event.target.value,
                          )?.color || "sage",
                        );
                      }}
                    >
                      <option value="">{tr("新标签", "New tag")}</option>
                      {organization?.tags.map((tag) => (
                        <option key={tag.name}>{tag.name}</option>
                      ))}
                    </select>
                  </label>
                  {colors.map((value, index) => (
                    <button
                      key={value}
                      disabled={busy}
                      className={`tool conversation-swatch tag-${value}`}
                      aria-label={colorLabels()[index]}
                      aria-pressed={color === value}
                      onClick={() => {
                        setColor(value);
                        if (editingTag)
                          void change({
                            action: "tag",
                            name: editingTag,
                            color: value,
                          });
                      }}
                    />
                  ))}
                </div>
                <form
                  className="conversation-add-tag"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!name.trim() || busy) return;
                    const tag = name.trim();
                    if (await change({ action: "tag", name: tag, color })) {
                      if (
                        await change({
                          action: "addTag",
                          keys: [...selected],
                          name: tag,
                        })
                      )
                        setName("");
                    }
                  }}
                >
                  <input
                    aria-label={tr("新标签名称", "New tag name")}
                    placeholder={tr("新标签名称", "New tag name")}
                    maxLength={24}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <button className="primary" disabled={busy || !name.trim()}>
                    {tr("创建并添加", "Create and add")}
                  </button>
                </form>
              </section>
            )}
            <div className="selection-footer">
              <small>
                {tr("已选", "Selected")} {selected.size}
              </small>
              <button
                className="tool"
                disabled={busy}
                onClick={() => {
                  setSelected(new Set());
                  setEditing(false);
                }}
              >
                {t("取消")}
              </button>
              <button
                className="tool"
                disabled={busy}
                onClick={() => setSelected(new Set(filtered.map(keyOf)))}
              >
                {tr("全选结果", "Select results")}
              </button>
              <span className="conversation-spacer" />
              {selected.size === 1 && [...selected][0].startsWith("codex:") && (
                <CodexThreadLink threadID={[...selected][0].slice(6)} />
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(!editing)}
              >
                {tr("标签", "Tags")}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void change({
                    action: "pin",
                    keys: [...selected],
                    pinned: !allPinned,
                  })
                }
              >
                {allPinned ? tr("取消置顶", "Unpin") : tr("置顶", "Pin")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
