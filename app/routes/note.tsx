import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import type { Route } from "./+types/note";
import { useApp } from "../lib/app-context";
import { api, download, errorMessage, post } from "../lib/api";
import { getLocale, t, tr } from "../lib/i18n";
import { createSaveQueue } from "../lib/save-queue";
import type { Clip, NoteFields } from "../lib/types";
import { Markdown } from "../components/markdown";
import { ErrorText, ProjectContext, TopicSelect } from "../components/common";
import { Modal } from "../components/modal";

export default function Note({ params }: Route.ComponentProps) {
  const app = useApp();
  const clip = app.library.clips.find((clip) => clip.id === params.noteID);
  if (!clip)
    return (
      <section className="workspace">
        <h1>{tr("笔记不存在", "Note not found")}</h1>
        <button className="tool" onClick={() => app.go("/library")}>
          {t("返回资料库")}
        </button>
      </section>
    );
  return <NoteView key={clip.id} clip={clip} />;
}
function NoteView({ clip }: { clip: Clip }) {
  const app = useApp();
  const [editing, setEditing] = useState(() => {
    try {
      return !!sessionStorage.getItem("threadline-edit:" + clip.id);
    } catch {
      return false;
    }
  });
  const [image, setImage] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (clip.ocrStatus !== "pending" || editing) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void app.refresh();
    }, 1800);
    return () => clearInterval(timer);
  }, [clip.ocrStatus, editing, app.refresh]);
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/clips/" + clip.id, { method: "DELETE" });
      setDeleted(true);
      await app.refresh();
      app.go("/library");
      app.notify(t("已删除"));
    } catch (error) {
      app.notify(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }
  if (deleted) return null;
  if (editing)
    return <NoteEditor clip={clip} onDone={() => setEditing(false)} />;
  return (
    <>
      <div className="note-toolbar">
        <button
          className="tool"
          onClick={() =>
            app.go(clip.topicID ? "/thoughts/" + clip.topicID : "/library")
          }
        >
          ← {clip.topicID ? t("我的思路") : t("资料库")}
        </button>
        <div className="tools">
          <button className="tool" onClick={() => setEditing(true)}>
            {t("编辑")}
          </button>
          <button
            className="tool"
            onClick={() =>
              download("/api/export/" + clip.id, "Threadline-export.zip")
            }
          >
            {t("导出笔记")}
          </button>
          <details className="session-more">
            <summary aria-label={t("更多操作")}>•••</summary>
            <div className="session-more-body">
              <button className="tool" onClick={() => void app.copy(clip.body)}>
                {t("复制原文")}
              </button>
              <button className="tool" onClick={() => setReview(true)}>
                {t("标记记录")}
              </button>
              <button
                className="tool"
                onClick={() =>
                  download("/api/export/all", "Threadline-export.zip")
                }
              >
                {t("导出最近笔记")}
              </button>
              <button
                className="tool danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                {t("删除")}
              </button>
            </div>
          </details>
        </div>
      </div>
      <div className="reading-scroll" id="scroll">
        <section className="reading" id="reader">
          <div className="entry-meta">
            <span className="source-badge">{clip.source}</span>
            <span>{clip.date}</span>
          </div>
          <h1>{clip.title}</h1>
          <div className="submeta">
            {tr(
              `约 ${Math.max(1, Math.ceil(clip.body.length / 500))} 分钟阅读 · ${clip.body.length} 字`,
              `${Math.max(1, Math.ceil(clip.body.length / 500))} min read · ${clip.body.length} characters`,
            )}
          </div>
          <ProjectContext source={clip.provenance} />
          {clip.note ? (
            <aside className="note">
              <div className="note-label">{t("我的判断与适用条件")}</div>
              <p>{clip.note}</p>
            </aside>
          ) : (
            <div className="reading-spacer" />
          )}
          {clip.question ? (
            <details className="question">
              <summary>{t("这段回答，来自什么问题？")}</summary>
              <p>{clip.question}</p>
            </details>
          ) : null}
          {clip.hasImage ? (
            <>
              <div className="image-note">
                {clip.ocrStatus === "pending"
                  ? t("原图已保存 · 正在本机识别文字…")
                  : t("原图已保留 · 识别文字可编辑核对")}
              </div>
              <button className="image-preview" onClick={() => setImage(true)}>
                <img
                  src={
                    "/api/attachments/" + encodeURIComponent(clip.attachment!)
                  }
                  alt={t("笔记原图缩略图")}
                />
              </button>
            </>
          ) : null}
          <Markdown
            text={clip.body}
            clip={clip.id}
            thread={clip.provenance?.threadID}
            runtime={clip.provenance?.runtime}
          />
          {clip.assets?.length ? (
            <p className="image-note">
              {tr(
                `已保存 ${clip.assets.length} 个附件，原文件移动后仍可查看`,
                `${clip.assets.length} attachments saved locally`,
              )}
            </p>
          ) : null}
          {clip.assetWarnings?.length ? (
            <details className="question">
              <summary>{tr("未保存的附件", "Attachments not saved")}</summary>
              {clip.assetWarnings.map((asset, index) => (
                <p key={index}>
                  {asset.name} · {asset.reason}
                </p>
              ))}
            </details>
          ) : null}
          {clip.sourceURL ? (
            <details className="question">
              <summary>{t("原会话链接")}</summary>
              <p>{clip.sourceURL}</p>
            </details>
          ) : null}
          <aside className="note review-note">
            {clip.review ? (
              <>
                <strong className="review-badge">
                  {clip.review.status === "outdated"
                    ? t("已过时")
                    : t("已更新")}
                </strong>
                <p>{clip.review.reason}</p>
                <small>
                  {new Date(clip.review.at).toLocaleString(getLocale())}
                </small>
              </>
            ) : (
              <p>
                {tr(
                  "保留原文，核实后补充判断",
                  "Keep the original and add your assessment after review",
                )}
              </p>
            )}
            {clip.reviewHistory?.length ? (
              <details>
                <summary>{tr("查看标记历史", "Review history")}</summary>
                {[...clip.reviewHistory].reverse().map((entry, index) => (
                  <p key={index}>
                    {entry.status === "outdated" ? t("已过时") : t("已更新")} ·{" "}
                    {entry.reason} ·{" "}
                    {new Date(entry.at).toLocaleString(getLocale())}
                  </p>
                ))}
              </details>
            ) : null}
            <button className="tool" onClick={() => setReview(true)}>
              {t("标记记录")}
            </button>
          </aside>
          <div className="article-end">THREADLINE</div>
        </section>
      </div>
      <footer className="bottom">
        <span className="saved">{t("只在本机保存")}</span>
        <button className="primary" onClick={() => app.openCarry([clip.id])}>
          {t("使用对话")} ↗
        </button>
      </footer>
      {image ? (
        <Modal
          title={t("笔记原图")}
          className="image-dialog"
          onClose={() => setImage(false)}
        >
          <img
            src={"/api/attachments/" + encodeURIComponent(clip.attachment!)}
            alt={t("笔记原图")}
          />
        </Modal>
      ) : null}
      {review ? (
        <ReviewDialog clip={clip} onClose={() => setReview(false)} />
      ) : null}
    </>
  );
}

function NoteEditor({ clip, onDone }: { clip: Clip; onDone(): void }) {
  const app = useApp();
  const storageKey = "threadline-edit:" + clip.id;
  const original = {
    title: clip.title,
    note: clip.note,
    question: clip.question,
    sourceURL: clip.sourceURL,
    topicID: clip.topicID,
    body: clip.body,
  };
  const [initial] = useState(() => {
    try {
      const stored: unknown = JSON.parse(
        sessionStorage.getItem(storageKey) || "null",
      );
      if (
        stored &&
        typeof stored === "object" &&
        "fields" in stored &&
        "version" in stored &&
        typeof stored.version === "string"
      ) {
        const fields = stored.fields as Record<string, unknown>;
        if (
          fields &&
          Object.keys(original).every((key) => typeof fields[key] === "string")
        )
          return {
            fields: fields as NoteFields,
            version: stored.version,
            recovered: true,
          };
      }
    } catch {
      /* use server copy */
    }
    return { fields: original, version: clip.version, recovered: false };
  });
  const [fields, setFields] = useState<NoteFields>(initial.fields),
    [status, setStatus] = useState<"saved" | "saving" | "error">(
      initial.recovered ? "error" : "saved",
    ),
    [error, setError] = useState<unknown>(
      initial.recovered
        ? tr(
            "已恢复未保存的编辑，请核对后重试保存",
            "Unsaved edits recovered. Review them and retry saving",
          )
        : null,
    );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const [queue] = useState(() =>
    createSaveQueue<NoteFields, Clip>(
      initial.version,
      async (draft, version) => {
        return (
          await post<{ clip: Clip }>(
            "/api/clips/" + clip.id,
            { ...draft, version },
            "PUT",
          )
        ).clip;
      },
      (saved) => {
        try {
          const stored = JSON.parse(
            sessionStorage.getItem(storageKey) || "null",
          );
          if (stored)
            sessionStorage.setItem(
              storageKey,
              JSON.stringify({ ...stored, version: saved.version }),
            );
        } catch {
          /* memory queue retains the current version */
        }
      },
    ),
  );
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      await queue.flush();
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* saving succeeded even when storage is unavailable */
      }
      if (mounted.current) {
        setStatus("saved");
        setError(null);
      }
    } catch (error) {
      if (mounted.current) {
        setStatus("error");
        setError(error);
      }
      throw error;
    }
  }, [queue, storageKey]);
  useEffect(() => {
    if (initial.recovered) queue.push(initial.fields);
  }, [initial, queue]);
  useEffect(() => {
    mounted.current = true;
    const unload = (event: BeforeUnloadEvent) => {
      if (queue.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", unload);
    };
  }, [queue]);
  const blocker = useBlocker(() => queue.dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    void flush()
      .then(() => {
        if (active) {
          void app.refresh();
          blocker.proceed();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [blocker, flush, app.refresh]);
  function change(key: keyof NoteFields, value: string) {
    const next = { ...fields, [key]: value };
    setFields(next);
    queue.push(next);
    setStatus("saving");
    setError(null);
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ fields: next, version: queue.version }),
      );
    } catch {
      /* unload guard still prevents silent loss */
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 400);
  }
  async function done() {
    try {
      await flush();
      await app.refresh();
      onDone();
    } catch {
      /* keep the draft visible */
    }
  }
  return (
    <section className="editor route-scroll" id="editor">
      <div className="editor-head">
        <h2>{t("整理笔记")}</h2>
        <button className="tool" onClick={() => void done()}>
          {t("完成编辑 ↗")}
        </button>
      </div>
      <p role="status">
        {status === "saved"
          ? t("已保存到本机")
          : status === "saving"
            ? t("正在保存…")
            : tr(
                "尚未保存，当前编辑已保留",
                "Not saved; your edits are retained",
              )}
      </p>
      {(
        ["title", "note", "question", "sourceURL", "topicID", "body"] as const
      ).map((key) => {
        const label = {
          title: t("标题"),
          note: t("我的判断与适用条件"),
          question: t("原问题 · 可选"),
          sourceURL: t("会话链接 · 可选"),
          topicID: t("归入思路"),
          body: t("笔记原文 · Markdown"),
        }[key];
        return (
          <div key={key}>
            <label htmlFor={"edit-" + key}>{label}</label>
            {key === "topicID" ? (
              <TopicSelect
                id={"edit-" + key}
                topics={app.library.topics}
                value={fields[key]}
                onChange={(event) => change(key, event.target.value)}
              />
            ) : key === "body" || key === "note" ? (
              <textarea
                id={"edit-" + key}
                className={key === "body" ? "body" : ""}
                rows={key === "body" ? 18 : 3}
                value={fields[key]}
                onChange={(event) => change(key, event.target.value)}
              />
            ) : (
              <input
                id={"edit-" + key}
                value={fields[key]}
                onChange={(event) => change(key, event.target.value)}
                autoFocus={key === "title"}
              />
            )}
          </div>
        );
      })}
      <ErrorText error={error} />
      {status === "error" ? (
        <button
          className="secondary"
          onClick={() =>
            void flush()
              .then(app.refresh)
              .catch(() => {})
          }
        >
          {tr("重试保存", "Retry save")}
        </button>
      ) : null}
      {blocker.state === "blocked" && status === "error" ? (
        <Modal
          title={tr("编辑尚未保存", "Edits have not been saved")}
          onClose={() => blocker.reset()}
        >
          <ErrorText error={error} />
          <button
            className="primary"
            onClick={() =>
              void flush()
                .then(() => {
                  void app.refresh();
                  blocker.proceed();
                })
                .catch(() => {})
            }
          >
            {tr("重试保存并继续", "Save and continue")}
          </button>
          <button className="secondary" onClick={() => blocker.reset()}>
            {tr("留在编辑页面", "Stay in editor")}
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

function ReviewDialog({ clip, onClose }: { clip: Clip; onClose(): void }) {
  const app = useApp();
  const [status, setStatus] = useState("updated"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <Modal title={t("标记记录")} onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await post("/api/clips/" + clip.id + "/review", {
              status,
              reason,
              version: clip.version,
            });
            await app.refresh();
            onClose();
          } catch (error) {
            setError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label" htmlFor="review-status">
          {tr("核实状态", "Review status")}
        </label>
        <select
          id="review-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={busy}
        >
          <option value="updated">{t("已更新")}</option>
          <option value="outdated">{t("已过时")}</option>
        </select>
        <label className="field-label" htmlFor="review-reason">
          {tr("原因", "Reason")}
        </label>
        <textarea
          id="review-reason"
          className="capture-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={12000}
          required
          disabled={busy}
        />
        <ErrorText error={error} />
        <div className="dialog-bottom">
          <button className="primary" disabled={busy}>
            {t("保存")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
