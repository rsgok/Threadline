import { WindowHeading } from "../components/window-heading";
import { lazy, Suspense, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import type { Route } from "./+types/note";
import { useApp } from "../lib/app-context";
import { api, download, errorMessage, post } from "../lib/api";
import { getLocale, t, tr } from "../lib/i18n";
import { createSaveQueue } from "../lib/save-queue";
import type { Clip, NoteFields, Snapshot } from "../lib/types";
import { ErrorText, Icon, ProjectContext, TopicSelect } from "../components/common";
import { noteMessages } from "../lib/note-content";
const ShareDialog = lazy(() => import("../components/share-dialog").then(module => ({default: module.ShareDialog})));
const NoteRichEditor = lazy(() => import("../components/note-rich-editor"));
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
  const collectedAt = clip.collectedAt || new Date((clip.createdAt + 978307200) * 1000).toISOString();
  const app = useApp();
  const [image, setImage] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false);
  const [supplement, setSupplement] = useState(false);
  const [share, setShare] = useState<Snapshot | null>(null);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (clip.ocrStatus !== "pending") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void app.refresh();
    }, 1800);
    return () => clearInterval(timer);
  }, [clip.ocrStatus, app.refresh]);
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
  return (
    <NoteEditor clip={clip}>{({fields, change, update, status, save}) => <>

      <div className="reading-scroll" id="scroll">
        <section className="reading note-detail" id="reader">
          <WindowHeading>
            <div className="page-heading-actions note-detail-heading">
              <h1 className="note-title-wrap"><input id="edit-title" className="note-title-input" aria-label={t("标题")} value={fields.title} onChange={e => change("title", e.target.value)} /></h1>
              <div className="heading-actions">
          <button className="tool icon-tool" aria-label={t("导出笔记")} title={t("导出笔记")} onClick={() => void save().then(() => download("/api/export/" + clip.id, "Threadline-export.zip")).catch(error => app.notify(errorMessage(error), true))}><Icon name="download" /></button>
          <button className="tool icon-tool" aria-label={t("使用对话")} title={t("使用对话")} onClick={() => void save().then(app.refresh).then(() => app.openCarry([clip.id])).catch(error => app.notify(errorMessage(error), true))}><Icon name="carry" /></button>
          <button className="tool icon-tool" aria-label={t("分享")} title={t("分享")} onClick={() => void save().then(async () => {
            const latest = await api<{clip: Clip}>("/api/clips/" + clip.id);
            setShare({clipID:clip.id,clipVersion:latest.clip.version,runtime:clip.provenance?.runtime || "codex",threadID:clip.id,messageIDs:[clip.id],fingerprints:{},includeProgress:false});
          }).catch(error => app.notify(errorMessage(error), true))}><Icon name="share" /></button>
          <details className="session-more">
            <summary aria-label={t("更多操作")}>•••</summary>
            <div className="session-more-body">
              <button className="tool" onClick={event => { event.currentTarget.closest("details")!.open = false; setSupplement(true); }}>{tr("编辑补充信息", "Edit additional information")}</button>
              <button className="tool" onClick={() => setReview(true)}>{t("标记记录")}</button>
              <button className="tool" onClick={() => void app.copy(clip.body)}>
                {t("复制原文")}
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
          </WindowHeading>
          <header className="note-banner">
            <div className="note-banner-meta">
              <span>{tr("收纳于", "Collected")} <time dateTime={collectedAt}>{new Date(collectedAt).toLocaleString(getLocale(), {year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"})}</time></span>
              <span>{tr(`约 ${Math.max(1, Math.ceil(clip.body.length / 500))} 分钟阅读`, `${Math.max(1, Math.ceil(clip.body.length / 500))} min read`)}</span>
              <span>{clip.source}</span>
              {<span role="status">{status === "saved" ? t("已保存到本机") : status === "saving" ? t("正在保存…") : tr("尚未保存", "Not saved")}</span>}
            </div>
            <details className="note-banner-details">
              <summary>{tr("详细信息", "Details")}</summary>
              <div>{tr(`${clip.body.length} 字`, `${clip.body.length} characters`)}</div>
              <ProjectContext source={clip.provenance} />
              {clip.sourceURL ? <div className="note-source-url">{t("原会话链接")} · {clip.sourceURL}</div> : null}
              {clip.topicID ? <div>{tr("思路", "Thread")} · {app.library.topics.find(topic => topic.id === clip.topicID)?.title}</div> : null}
            </details>
          </header>
          {clip.note ? (
            <aside className="note">
              <div className="note-label">{t("我的判断与适用条件")}</div>
              <p>{clip.note}</p>
            </aside>
          ) : null}
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
          <NoteBody onSave={save} clip={clip} text={fields.body} onChange={text => change("body", text)} />
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
          {clip.review || clip.reviewHistory?.length ? <aside className="note review-note">
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
            ) : null}
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
          </aside> : null}
          <div className="article-end">THREADLINE</div>
        </section>
      </div>
      {supplement ? <SupplementDialog fields={fields} onClose={() => setSupplement(false)} onSave={async patch => { update(patch); await save(); await app.refresh(); }} /> : null}
      <Suspense fallback={null}>{share ? <ShareDialog snapshot={share} onClose={() => setShare(null)} /> : null}</Suspense>
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
    </>}</NoteEditor>
  );
}

type NoteDraftView = { fields: NoteFields; update(patch: Partial<NoteFields>): void; change(key: keyof NoteFields, value: string): void; status: "saved" | "saving" | "error"; save(): Promise<void> };
function NoteEditor({ clip, children }: { clip: Clip; children(draft: NoteDraftView): ReactNode }) {
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
  useEffect(() => {
    try { if (sessionStorage.getItem(storageKey)) return; } catch { if (initial.recovered) return; }
    if (queue.rebase(clip.version)) {
      setFields({ title: clip.title, note: clip.note, question: clip.question, sourceURL: clip.sourceURL, topicID: clip.topicID, body: clip.body });
    }
  }, [clip.version]);
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
  function change(key: keyof NoteFields, value: string) { update({ [key]: value }); }
  function update(patch: Partial<NoteFields>) {
    const next = { ...fields, ...patch };
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
      void flush().then(app.refresh).catch(() => {});
    }, 400);
  }
  return (
    <>
      {children({fields, change, update, status, save:flush})}
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
    </>
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

function NoteBody({ clip, text, onChange, onSave }: { clip: Clip; text: string; onChange(text: string): void; onSave(): Promise<void> }) {
  const messages = clip.provenance ? noteMessages(text) : null;
  const render = (body: string, change: (value: string) => void) => <Suspense fallback={<p>{tr("正在准备编辑…", "Preparing editor…")}</p>}><NoteRichEditor onSave={onSave} text={body} onChange={change} context={{clip:clip.id,thread:clip.provenance?.threadID,runtime:clip.provenance?.runtime}} /></Suspense>
;
  if (!messages) return render(text, onChange);
  return <div className="note-conversation">{messages.map((message, index) => {
    const user = message.role === "我的问题";
    const rawTime = message.timestamp.replace(' UTC', 'Z').replace(' ', 'T');
    const date = new Date(rawTime);
    return <section key={index} className={`note-message ${user ? "from-user" : "from-ai"}`}>
      <div className="note-message-meta">
        <span className="note-role">{user ? tr("你", "You") : "AI"}</span>
        <span>{user ? tr("发言", "Message") : message.role === "AI 过程消息" ? tr("过程", "Progress") : tr("回答", "Answer")}</span>
        {message.timestamp ? <time title={message.timestamp} dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{Number.isNaN(date.getTime()) ? message.timestamp : date.toLocaleString(getLocale(), {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time> : null}
      </div>
      {render(message.body, body => onChange(text.slice(0, message.bodyStart) + body + text.slice(message.end)))}
    </section>;
  })}</div>;
}

function SupplementDialog({fields,onClose,onSave}: {fields:NoteFields;onClose():void;onSave(patch:Partial<NoteFields>):Promise<void>}) {
  const app=useApp();
  const [draft,setDraft]=useState({note:fields.note,question:fields.question,sourceURL:fields.sourceURL,topicID:fields.topicID});
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>();
  return <Modal title={tr("编辑补充信息","Edit additional information")} onClose={onClose} busy={busy}>
    <form onSubmit={event=>{event.preventDefault();setBusy(true);setError(null);void onSave(draft).then(onClose).catch(setError).finally(()=>setBusy(false));}}>
      <label className="field-label" htmlFor="supplement-topic">{t("归入思路")}</label>
      <TopicSelect id="supplement-topic" topics={app.library.topics} value={draft.topicID} disabled={busy} onChange={e=>setDraft({...draft,topicID:e.target.value})} />
      <label className="field-label" htmlFor="supplement-note">{t("我的判断与适用条件")}</label>
      <textarea id="supplement-note" className="capture-input" rows={4} value={draft.note} disabled={busy} onChange={e=>setDraft({...draft,note:e.target.value})} />
      <label className="field-label" htmlFor="supplement-question">{t("原问题 · 可选")}</label>
      <textarea id="supplement-question" className="capture-input" rows={3} value={draft.question} disabled={busy} onChange={e=>setDraft({...draft,question:e.target.value})} />
      <label className="field-label" htmlFor="supplement-url">{t("会话链接 · 可选")}</label>
      <input id="supplement-url" value={draft.sourceURL} disabled={busy} onChange={e=>setDraft({...draft,sourceURL:e.target.value})} />
      <ErrorText error={error} />
      <div className="dialog-bottom"><button className="primary" disabled={busy}>{t("保存")}</button></div>
    </form>
  </Modal>;
}
