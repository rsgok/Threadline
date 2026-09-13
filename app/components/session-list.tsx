import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { api, post, errorMessage } from "../lib/api";
import { useApp } from "../lib/app-context";
import { getLocale, t, tr } from "../lib/i18n";
import type { RecentSession, Session } from "../lib/types";
import { CodexThreadLink } from "./codex-thread-link";
import { WindowHeading } from "./window-heading";

type Organization = {
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

export function SessionList({
  data,
}: {
  data: {
    sessions: RecentSession[];
    errors?: { runtime: string; message: string }[];
  };
}) {
  const app = useApp(),
    location = useLocation();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [runtime, setRuntime] = useState("all"),
    [scope, setScope] = useState("all"),
    [tagFilter, setTagFilter] = useState(""),
    [grouped, setGrouped] = useState(true),
    [limit, setLimit] = useState(6);
  const [organization, setOrganization] = useState<Organization | null>(null),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<Record<string, Session | null>>({}),
    [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
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
    void load();
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let index = 0;
    setReady(false);
    // Bound transcript discovery so large local histories do not flood the service.
    async function worker() {
      while (index < data.sessions.length && !controller.signal.aborted) {
        const session = data.sessions[index++],
          key = keyOf(session);
        try {
          const result = await api<{ session: Session }>(
            `/api/${session.runtime}/sessions/${encodeURIComponent(session.id)}?summary=1`,
            { signal: controller.signal },
          );
          if (!controller.signal.aborted)
            setDetails((old) => ({ ...old, [key]: result.session }));
        } catch {
          if (!controller.signal.aborted)
            setDetails((old) => ({ ...old, [key]: null }));
        }
      }
    }
    void Promise.all(Array.from({ length: 3 }, worker)).then(() => {
      if (!controller.signal.aborted) setReady(true);
    });
    return () => controller.abort();
  }, [data.sessions]);
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
  const visible = filtered.slice(0, limit);
  const projectKey = (session: RecentSession) =>
    details[keyOf(session)]?.project?.root ||
    details[keyOf(session)]?.cwd ||
    "";
  const groups =
    grouped && ready ? [...new Set(visible.map(projectKey))] : ["all"];
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
    setLimit(6);
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
              src="/assets/threadline-icon.png"
              alt=""
            />
            <span className="session-wordmark">
              Thread<em>line</em>
            </span>
          </div>
          <div className="dialog-head">
            <WindowHeading>
              <h2>{t("收录对话")}</h2>
            </WindowHeading>
          </div>
          <div className="session-description-row">
            <p className="session-subtitle">
              {tr(
                "浏览本机对话，留下值得继续的讨论",
                "Browse local conversations and keep what matters",
              )}
            </p>
            <button
              className="tool session-manual-add"
              onClick={() => app.capture()}
            >
              {t("手动添加 ↗")}
            </button>
          </div>
        </div>
        <div className="session-messages conversation-browser">
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
            <select
              className="runtime-filter"
              aria-label={t("按 Runtime 筛选会话")}
              value={runtime}
              onChange={(event) =>
                resetFilter(() => setRuntime(event.target.value))
              }
            >
              <option value="all">{t("全部 Runtime")}</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
          <div className="conversation-filters">
            <select
              aria-label={tr("对话范围", "Conversation scope")}
              value={scope}
              onChange={(event) =>
                resetFilter(() => setScope(event.target.value))
              }
            >
              <option value="all">{t("全部对话")}</option>
              <option value="pin">{tr("已置顶", "Pinned")}</option>
              <option value="untagged">{tr("未打标签", "Untagged")}</option>
            </select>
            <small>{filtered.length}</small>
            <span className="conversation-spacer" />
            <select
              aria-label={tr("标签筛选", "Filter by tag")}
              value={tagFilter}
              onChange={(event) =>
                resetFilter(() => setTagFilter(event.target.value))
              }
            >
              <option value="">{tr("全部标签", "All tags")}</option>
              {organization?.tags.map((tag) => (
                <option key={tag.name}>{tag.name}</option>
              ))}
            </select>
            <button className="tool" onClick={() => setGrouped(!grouped)}>
              {grouped ? tr("按项目", "By project") : tr("不分组", "Ungrouped")}
            </button>
          </div>
          {loadError && (
            <p className="session-errors" role="alert">
              {loadError}
            </p>
          )}
          <div
            className={`session-choices conversation-choices ${selected.size ? "has-selection" : ""}`}
          >
            {groups.map((group) => (
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
                    {collapsed.has(group) ? "›" : "⌄"}{" "}
                    {details[
                      keyOf(
                        visible.find(
                          (session) => projectKey(session) === group,
                        )!,
                      )
                    ]?.project?.name ||
                      group.split(/[\\/]/).filter(Boolean).at(-1) ||
                      tr("其他对话", "Other conversations")}{" "}
                    <small>
                      {
                        visible.filter(
                          (session) => projectKey(session) === group,
                        ).length
                      }
                    </small>
                  </button>
                )}
                {!collapsed.has(group) &&
                  visible
                    .filter(
                      (session) =>
                        group === "all" || projectKey(session) === group,
                    )
                    .map((session) => {
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
                              {session.runtime === "codex" ? "Codex" : "Cursor"}
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
              </div>
            ))}
            {filtered.length > limit && (
              <button className="tool" onClick={() => setLimit(limit + 6)}>
                {t("显示更多会话")}
              </button>
            )}
          </div>
          {data.errors
            ?.filter((error) => runtime === "all" || error.runtime === runtime)
            .map((error) => (
              <p className="session-errors" key={error.runtime}>
                {error.runtime} · {error.message}
              </p>
            ))}
          {!filtered.length && (
            <p className="session-guide">
              {query || scope !== "all" || tagFilter
                ? t("没有匹配的会话。")
                : t("没有找到本机会话，可通过「手动添加」收录。")}
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
