import { WindowHeading } from "../components/window-heading";
import { useEffect, useState } from "react";
import type { Route } from "./+types/thought";
import { api, post } from "../lib/api";
import { useApp } from "../lib/app-context";
import { t, tr } from "../lib/i18n";
import type {
  Clip,
  Relation,
  RelationsResult,
  RelationType,
  Topic,
} from "../lib/types";
import { Modal } from "../components/modal";
import { ErrorText } from "../components/common";

const relationTypes: Record<RelationType, [string, string]> = {
  supports: ["支持", "Supports"],
  extends: ["补充", "Extends"],
  contradicts: ["冲突", "Contradicts"],
  related: ["相关", "Related"],
};
export function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  return api<RelationsResult>(
    "/api/thoughts/" + params.topicID + "/relations",
    { signal: request.signal },
  );
}
export default function Thought({ params, loaderData }: Route.ComponentProps) {
  const app = useApp(),
    topic = app.library.topics.find((topic) => topic.id === params.topicID);
  if (!topic)
    return (
      <section className="workspace">
        <h1>{tr("思路不存在", "Thought not found")}</h1>
      </section>
    );
  return <ThoughtView key={topic.id} topic={topic} initial={loaderData} />;
}
function ThoughtView({
  topic,
  initial,
}: {
  topic: Topic;
  initial: RelationsResult;
}) {
  const app = useApp(),
    [view, setView] = useState<"timeline" | "graph">("timeline");
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [editor, setEditor] = useState<{ relation?: Relation } | null>(null);
  const notes = app.library.clips
    .filter((note) => note.topicID === topic.id)
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  async function refresh() {
    setData(
      await api<RelationsResult>("/api/thoughts/" + topic.id + "/relations"),
    );
  }
  useEffect(() => {
    setData(initial);
  }, [initial]);
  useEffect(() => {
    if (data.job?.status !== "running") return;
    let active = true,
      pending = false;
    const controller = new AbortController();
    const update = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const result = await api<RelationsResult>(
          "/api/thoughts/" + topic.id + "/relations",
          { signal: controller.signal },
        );
        if (active) setData(result);
      } catch (error) {
        if (active) setError(error);
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => {
      void update();
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }, [topic.id, data.job?.status]);
  async function analyze() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/thoughts/" + topic.id + "/analyze");
      setView("graph");
      await refresh();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function review(relation: Relation, status: string) {
    if (busy) return;
    setBusy(true);
    try {
      await post("/api/relations/" + relation.id, { status }, "PUT");
      await refresh();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  const errors: Record<string, string> = {
    unavailable: tr(
      "无法启动 Codex，请确认已安装并登录后重试",
      "Could not start Codex. Install and sign in, then retry",
    ),
    execution_failed: tr(
      "Codex 分析未完成，请检查登录和网络后重试",
      "Analysis failed. Check your sign-in and network, then retry",
    ),
    timeout: tr("分析超时，可以重新尝试", "Analysis timed out. Try again"),
    interrupted: tr(
      "上次分析被中断，可以重新尝试",
      "Analysis was interrupted. Try again",
    ),
    invalid_result: tr(
      "分析结果或原文发生变化，请重新分析",
      "The result or source changed. Run analysis again",
    ),
    too_large: tr(
      "对话内容过多，请拆分为较小的思路后分析",
      "Too much content. Split into smaller thoughts",
    ),
  };
  const status =
    data.job?.status === "running"
      ? tr(
          "Codex 正在阅读对话并寻找有依据的联系，你可以继续浏览",
          "Codex is finding evidence-backed connections. You can keep browsing",
        )
      : data.job?.status === "completed"
        ? tr(
            `分析完成 · ${data.job.count} 条建议，确认后加入关系图`,
            `Analysis complete · ${data.job.count} suggestions to review`,
          )
        : data.job?.status === "failed"
          ? errors[data.job.error || ""] ||
            tr("分析未完成，请重试", "Analysis failed. Try again")
          : notes.length < 2
            ? tr(
                "收录至少两段对话后，可以发现它们之间的联系",
                "Collect at least two conversations to discover connections",
              )
            : tr(
                "让 Codex 寻找联系，结果由你确认",
                "Let Codex find connections for you to review",
              );
  const confirmed = data.relations.filter(
      (relation) => relation.status === "confirmed",
    ),
    suggestions = data.relations.filter(
      (relation) => relation.status === "suggested",
    );
  return (
    <section className="workspace route-scroll">
      <div className="thought-heading">
        <WindowHeading><h1 className="thinking-title">{topic.title}</h1></WindowHeading>
        <button className="tool" onClick={() => app.editTopic(topic)}>
          {t("编辑思路")}
        </button>
      </div>
      <p className="workspace-description">
        {topic.goal ||
          tr("围绕这个问题，继续积累讨论", "Keep exploring this question")}
      </p>
      <div className="thought-controls">
        <div className="thought-tabs">
          {(["timeline", "graph"] as const).map((key) => (
            <button
              className="secondary"
              key={key}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {key === "timeline"
                ? tr("时间线", "Timeline")
                : tr("关系图", "Relations")}
            </button>
          ))}
        </div>
        <button
          className="primary"
          disabled={busy || notes.length < 2 || data.job?.status === "running"}
          onClick={() => void analyze()}
        >
          {data.job?.status === "running"
            ? tr("正在分析…", "Analyzing…")
            : tr("发现关联", "Discover relations")}
        </button>
      </div>
      <p className="thought-analysis-status" role="status">
        {status}
      </p>
      <ErrorText error={error} />
      {view === "timeline" ? (
        <>
          <div className="thought-timeline">
            {notes.map((note) => (
              <article className="thought-event" key={note.id}>
                <div className="thought-event-meta">
                  <small>
                    {note.date} · {note.source}
                  </small>
                </div>
                <button
                  className="note-open"
                  onClick={() => app.go("/notes/" + note.id)}
                >
                  {note.title}
                </button>
                <p className="thought-event-excerpt">{excerpt(note)}</p>
                <button
                  className="tool"
                  onClick={() => app.go("/notes/" + note.id)}
                >
                  {tr("查看原对话 →", "Open conversation →")}
                </button>
              </article>
            ))}
            {!notes.length ? (
              <p className="workspace-empty">
                {tr(
                  "收录第一段对话，开始这条思路",
                  "Collect a conversation to begin this thought",
                )}
              </p>
            ) : null}
          </div>
          <p className="thought-footnote">
            {tr(
              "按收录时间排序 · 最新在前",
              "Sorted by collection time · newest first",
            )}
          </p>
        </>
      ) : (
        <div className="thought-relations">
          <div className="thought-map">
            {!confirmed.some((relation) => !relation.stale) ? (
              <>
                <div className="thought-map-symbol">◎</div>
                <h2>
                  {tr("把零散讨论，连成一条思路", "Connect your conversations")}
                </h2>
                <p>
                  {tr(
                    "确认关联后，这里会呈现对话之间的支持、补充与分歧",
                    "Confirmed connections will show support, additions and disagreements",
                  )}
                </p>
              </>
            ) : (
              confirmed
                .filter((relation) => !relation.stale)
                .map((relation) => (
                  <div className="thought-map-row" key={relation.id}>
                    <button
                      className="thought-map-node secondary"
                      onClick={() => app.go("/notes/" + relation.from)}
                    >
                      {notes.find((note) => note.id === relation.from)?.title}
                    </button>
                    <div className="thought-map-link" title={relation.reason}>
                      <span className="relation-type">
                        {tr(...relationTypes[relation.type])}
                      </span>
                      <span className="thought-map-arrow">⟶</span>
                    </div>
                    <button
                      className="thought-map-node secondary"
                      onClick={() => app.go("/notes/" + relation.to)}
                    >
                      {notes.find((note) => note.id === relation.to)?.title}
                    </button>
                  </div>
                ))
            )}
          </div>
          <button
            className="tool"
            disabled={notes.length < 2 || busy}
            onClick={() => setEditor({})}
          >
            {tr("手动连接两段对话", "Connect two conversations manually")}
          </button>
          <div className="thought-section-heading">
            <h2>{tr("待确认", "For review")}</h2>
            <small>{suggestions.length}</small>
          </div>
          {!suggestions.length ? (
            <p className="workspace-description">
              {tr(
                "暂无待确认的关联，点击「发现关联」开始分析",
                "No suggestions yet. Choose Discover relations to start",
              )}
            </p>
          ) : null}
          {suggestions.map((relation) => (
            <RelationCard
              key={relation.id}
              relation={relation}
              notes={notes}
              busy={busy}
              edit={() => setEditor({ relation })}
              review={(status) => void review(relation, status)}
            />
          ))}
          {confirmed.length ? (
            <details className="thought-confirmed">
              <summary>
                {tr(
                  `查看已确认关联的依据 · ${confirmed.length}`,
                  `Confirmed evidence · ${confirmed.length}`,
                )}
              </summary>
              {confirmed.map((relation) => (
                <RelationCard
                  key={relation.id}
                  relation={relation}
                  notes={notes}
                  busy={busy}
                  edit={() => setEditor({ relation })}
                  review={(status) => void review(relation, status)}
                />
              ))}
            </details>
          ) : null}
        </div>
      )}
      <div className="hero-actions">
        <button className="secondary" onClick={() => app.capture(topic.id)}>
          {t("添加笔记")}
        </button>
        <button
          className="tool"
          disabled={!notes.length}
          onClick={() => app.openCarry(notes.map((note) => note.id))}
        >
          {t("使用对话")}
        </button>
      </div>
      {editor ? (
        <RelationEditor
          topic={topic}
          notes={notes}
          relation={editor.relation}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await refresh();
            setView("graph");
            setEditor(null);
          }}
        />
      ) : null}
    </section>
  );
}
function excerpt(note: Clip) {
  return (note.note || note.body)
    .replace(
      /```[\s\S]*?```/g,
      tr("〔代码片段，打开原对话查看〕", "[Code in original conversation]"),
    )
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 260);
}
function RelationCard({
  relation,
  notes,
  busy,
  edit,
  review,
}: {
  relation: Relation;
  notes: Clip[];
  busy: boolean;
  edit(): void;
  review(status: string): void;
}) {
  const app = useApp();
  return (
    <article className="thought-relation">
      <span className="relation-type">
        {tr(...relationTypes[relation.type])}
      </span>
      {relation.stale ? (
        <small>
          {tr("原文已变化，请重新核对", "Source changed. Check evidence")}
        </small>
      ) : null}
      <div className="relation-pair">
        {(
          [
            ["from", "fromQuote"],
            ["to", "toQuote"],
          ] as const
        ).map(([id, quote]) => (
          <div key={id}>
            <button
              className="tool"
              onClick={() => app.go("/notes/" + relation[id])}
            >
              {notes.find((note) => note.id === relation[id])?.title ||
                relation[id]}
            </button>
            <blockquote>{relation[quote]}</blockquote>
          </div>
        ))}
      </div>
      <p className="relation-reason">{relation.reason}</p>
      <div className="relation-actions">
        {relation.status === "suggested" ? (
          <button
            className="primary"
            disabled={busy || relation.stale}
            onClick={() => review("confirmed")}
          >
            {tr("确认关联", "Confirm")}
          </button>
        ) : null}
        <button className="tool" disabled={busy} onClick={edit}>
          {t("编辑")}
        </button>
        <button
          className="tool"
          disabled={busy}
          onClick={() => review("dismissed")}
        >
          {t("移除")}
        </button>
      </div>
    </article>
  );
}
function RelationEditor({
  topic,
  notes,
  relation,
  onClose,
  onSaved,
}: {
  topic: Topic;
  notes: Clip[];
  relation?: Relation;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const [fields, setFields] = useState({
    from: relation?.from || notes[0].id,
    to: relation?.to || notes[1].id,
    fromQuote: relation?.fromQuote || "",
    toQuote: relation?.toQuote || "",
    type: relation?.type || "related",
    reason: relation?.reason || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <Modal
      id="thought-relation-editor"
      title={
        relation
          ? tr("编辑关联", "Edit relation")
          : tr("手动连接两段对话", "Connect two conversations")
      }
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await post(
              relation
                ? "/api/relations/" + relation.id
                : "/api/thoughts/" + topic.id + "/relations",
              {
                ...fields,
                topicID: topic.id,
                ...(relation ? { revision: relation.revision || 0 } : {}),
              },
              relation ? "PUT" : "POST",
            );
            await onSaved();
          } catch (error) {
            setError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="dialog-hint">
          {tr(
            "先选两段对话，再点选各自的依据，最后用一句话说明联系",
            "Choose two conversations, select evidence from each, then explain their connection",
          )}
        </p>
        <div className="relation-fields">
          {(["from", "to"] as const).map((key) => {
            const quote = key === "from" ? "fromQuote" : "toQuote";
            const note = notes.find((note) => note.id === fields[key]);
            return (
              <div key={key}>
                <label className="field-label" htmlFor={"relation-" + key}>
                  {key === "from"
                    ? tr("从这段对话", "From conversation")
                    : tr("关联到这段对话", "To conversation")}
                </label>
                <select
                  className="topic-select"
                  id={"relation-" + key}
                  value={fields[key]}
                  disabled={busy}
                  onChange={(event) =>
                    setFields((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                      [quote]: "",
                    }))
                  }
                >
                  {notes.map((note) => (
                    <option value={note.id} key={note.id}>
                      {note.title}
                    </option>
                  ))}
                </select>
                <details className="relation-source">
                  <summary>
                    {tr("选择原文中的依据", "Select source evidence")}
                  </summary>
                  <div className="relation-quote-options">
                    {note?.body
                      .split(/\n\s*\n/)
                      .filter(
                        (text) =>
                          text.trim() &&
                          !/^### (我的问题|AI 回答|AI 过程消息)/.test(text) &&
                          !/^---+$/.test(text.trim()),
                      )
                      .map((text, index) => (
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          key={index}
                          onClick={(event) => {
                            setFields((previous) => ({
                              ...previous,
                              [quote]: text.slice(0, 2000),
                            }));
                            const details =
                              event.currentTarget.closest("details");
                            if (details) details.open = false;
                          }}
                        >
                          {text.slice(0, 2000)}
                        </button>
                      ))}
                  </div>
                </details>
                <label className="field-label" htmlFor={"relation-" + quote}>
                  {tr(
                    "已选依据（也可直接粘贴原文）",
                    "Selected evidence (or paste an exact quote)",
                  )}
                </label>
                <textarea
                  className="capture-input"
                  id={"relation-" + quote}
                  required
                  maxLength={2000}
                  disabled={busy}
                  value={fields[quote]}
                  onChange={(event) =>
                    setFields((previous) => ({
                      ...previous,
                      [quote]: event.target.value,
                    }))
                  }
                />
              </div>
            );
          })}
          <label className="field-label" htmlFor="relation-type">
            {tr(
              "关系方向：前者如何关联后者",
              "Direction: how the first relates to the second",
            )}
          </label>
          <select
            className="topic-select"
            id="relation-type"
            disabled={busy}
            value={fields.type}
            onChange={(event) =>
              setFields((previous) => ({
                ...previous,
                type: event.target.value as RelationType,
              }))
            }
          >
            {Object.entries(relationTypes).map(([key, labels]) => (
              <option key={key} value={key}>
                {tr(...labels)}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="relation-reason">
            {tr("关联理由", "Reason")}
          </label>
          <textarea
            className="capture-input"
            id="relation-reason"
            required
            maxLength={2000}
            value={fields.reason}
            disabled={busy}
            onChange={(event) =>
              setFields((previous) => ({
                ...previous,
                reason: event.target.value,
              }))
            }
          />
        </div>
        <ErrorText error={error} />
        <div className="dialog-bottom">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("取消")}
          </button>
          <button className="primary" disabled={busy}>
            {tr("保存并确认", "Save and confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
