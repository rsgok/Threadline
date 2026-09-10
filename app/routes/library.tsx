import { WindowHeading } from "../components/window-heading";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useApp } from "../lib/app-context";
import { t, tr } from "../lib/i18n";

export default function Library() {
  const app = useApp(),
    [params] = useSearchParams();
  const scope = params.get("scope") || "all";
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(40);
  const clips = app.library.clips.filter(
    (clip) =>
      (scope === "all" ||
        (scope === "inbox" ? !clip.topicID : clip.topicID === scope)) &&
      `${clip.title} ${clip.body} ${clip.note}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="workspace route-scroll">
      <div className="thought-heading">
        <WindowHeading><h1>
          {scope === "inbox"
            ? t("未分类")
            : app.library.topics.find((topic) => topic.id === scope)?.title ||
              t("全部对话")}
        </h1></WindowHeading>
        <button
          className="primary"
          onClick={() =>
            app.capture(scope === "all" || scope === "inbox" ? "" : scope)
          }
        >
          ＋ {t("添加笔记")}
        </button>
      </div>
      <p className="workspace-description">
        {t("搜索原文和自己的备注，选出这次值得带上的材料。")}
      </p>
      <input
        className="topic-select"
        aria-label={tr("查找资料库", "Search library")}
        placeholder={t("搜索你的笔记")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setLimit(40);
        }}
      />
      {clips.slice(0, limit).map((clip) => (
        <article className="note-row" key={clip.id}>
          <div className="note-line">
            <button
              className="note-open"
              onClick={() => app.go("/notes/" + clip.id)}
            >
              {clip.title}
            </button>
            <button
              className={`use-note ${app.carry.includes(clip.id) ? "active" : ""}`}
              onClick={() => app.toggleCarry(clip.id)}
            >
              {app.carry.includes(clip.id) ? t("✓ 已加入") : t("＋ 使用对话")}
            </button>
          </div>
          <p className="note-excerpt">
            {(clip.note || clip.body).replace(/[#*`]/g, "").slice(0, 200)}
          </p>
          <div className="note-foot">
            <span>
              {clip.source} · {clip.date}
            </span>
            {clip.review ? (
              <span className="review-badge">
                {clip.review.status === "outdated" ? t("已过时") : t("已更新")}
              </span>
            ) : null}
          </div>
        </article>
      ))}
      {!clips.length ? (
        <p className="workspace-empty">{t("这里还没有内容。")}</p>
      ) : null}
      {clips.length > limit ? (
        <button className="tool" onClick={() => setLimit(limit + 40)}>
          {tr("显示更多笔记", "Show more notes")}
        </button>
      ) : null}
      {app.carry.length ? (
        <button className="primary" onClick={() => app.openCarry()}>
          {t("使用对话")} · {app.carry.length}
        </button>
      ) : null}
    </section>
  );
}
