import { useEffect, useRef, useState } from "react";
import { api, download, post } from "../lib/api";
import { useApp } from "../lib/app-context";
import { count, getLocale, t, translateError } from "../lib/i18n";
import type {
  CardTheme,
  RenderState,
  ShareJob,
  ShareStatus,
  Snapshot,
} from "../lib/types";
import { Modal } from "./modal";
import { ErrorText, useDebounced } from "./common";
import { PlatformConnection } from "./connections";
import { ShareHistory } from "./share-history";
import { FeishuShare } from "./feishu-share";
import "../../web/sharing.css";
import "../../web/feishu.css";

type Method = "copy" | "export" | "cards" | "feishu" | "slack" | "discord";
export function ShareDialog({
  snapshot,
  onClose,
  onBusy,
}: {
  snapshot: Snapshot;
  onClose(): void;
  onBusy?(busy: boolean): void;
}) {
  const app = useApp();
  const [method, setMethod] = useState<Method | null>(null),
    [note, setNote] = useState(""),
    [paths, setPaths] = useState<string[] | null>(null),
    [target, setTarget] = useState("");
  const [status, setStatus] = useState<ShareStatus | null>(null),
    [themes, setThemes] = useState<CardTheme[]>([]),
    [theme, setTheme] = useState(() => {
      try {
        return localStorage.getItem("threadline.cardTheme") || "sage";
      } catch {
        return "sage";
      }
    }),
    [mode, setMode] = useState<"pages" | "long">("pages");
  const [preview, setPreview] = useState<{ key: string; job: ShareJob } | null>(
      null,
    ),
    [error, setError] = useState<unknown>(),
    [info, setInfo] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]),
    [cursor, setCursor] = useState(""),
    [channelBusy, setChannelBusy] = useState(false);
  const [render, setRender] = useState<{
      jobID: string;
      state: RenderState;
    } | null>(null),
    [result, setResult] = useState(false),
    [page, setPage] = useState(0),
    [record, setRecord] = useState("");
  const renderTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    mounted = useRef(true);
  const platform =
    (method === "slack" && status?.slack.connected && target) ||
    (method === "discord" && status?.discord.connected)
      ? method
      : "export";
  const key = JSON.stringify({
    snapshot,
    platform,
    target,
    note,
    theme,
    mode,
    method,
    paths,
    locale: getLocale(),
  });
  const debounced = useDebounced(key, 300);
  const job = preview?.key === key ? preview.job : null;
  const preparing = !!method && method !== "feishu" && !job;
  const ready =
    job && render?.jobID === job.id && render.state.phase === "done";
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(renderTimer.current);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api<ShareStatus>("/api/share/status", { signal: controller.signal }),
      api<{ themes: CardTheme[] }>("/api/share/card-themes", {
        signal: controller.signal,
      }),
    ])
      .then(([status, { themes }]) => {
        setStatus(status);
        setThemes(themes);
        setTheme((previous) =>
          themes.some((theme) => theme.id === previous) ? previous : "sage",
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!method || method === "feishu" || debounced !== key) return;
    const controller = new AbortController();
    setError(null);
    setInfo("");
    const prepare = async () => {
      const payload = {
        ...snapshot,
        platform,
        target,
        note,
        cardTheme: theme,
        cardMode: mode,
        locale: getLocale(),
      };
      let next = await post<ShareJob>(
        "/api/share/preview",
        { ...payload, attachmentIDs: [] },
        "POST",
        controller.signal,
      );
      const selected =
        method === "copy"
          ? []
          : next.attachments
              .filter(
                (attachment) =>
                  attachment.available &&
                  (paths === null || paths.includes(attachment.path)),
              )
              .map((attachment) => attachment.id);
      if (selected.length)
        next = await post<ShareJob>(
          "/api/share/preview",
          { ...payload, attachmentIDs: selected },
          "POST",
          controller.signal,
        );
      if (!controller.signal.aborted) setPreview({ key, job: next });
    };
    void prepare().catch((error) => {
      if (!controller.signal.aborted) setError(error);
    });
    return () => controller.abort();
  }, [
    debounced,
    key,
    method,
    snapshot,
    platform,
    target,
    note,
    theme,
    mode,
    paths,
    revision,
  ]);
  async function loadChannels(more = false) {
    if (channelBusy) return;
    setChannelBusy(true);
    try {
      const result = await api<{
        channels: { id: string; name: string }[];
        cursor: string;
      }>(
        "/api/share/channels?cursor=" + encodeURIComponent(more ? cursor : ""),
      );
      setChannels((previous) =>
        more ? [...previous, ...result.channels] : result.channels,
      );
      setCursor(result.cursor);
    } catch (error) {
      setError(error);
    } finally {
      setChannelBusy(false);
    }
  }
  async function refreshConnection() {
    try {
      setStatus(await api<ShareStatus>("/api/share/status"));
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error);
    }
  }
  async function makeCards() {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    setResult(true);
    setPage(0);
    const id = job.id;
    setRender({
      jobID: id,
      state: { phase: "starting", message: t("正在准备图卡") },
    });
    const poll = async (state: RenderState) => {
      if (!mounted.current) return;
      setRender({ jobID: id, state });
      if (["done", "failed", "cancelled"].includes(state.phase)) {
        if (state.phase === "done")
          void post(`/api/share/jobs/${id}/activity`, {
            action: "cards",
          }).catch(setError);
        setBusy(false);
        return;
      }
      renderTimer.current = setTimeout(() => {
        void api<RenderState>(`/api/share/jobs/${id}/render`)
          .then(poll)
          .catch((error) => {
            if (mounted.current) {
              setError(error);
              setBusy(false);
            }
          });
      }, 650);
    };
    try {
      await poll(await post<RenderState>(`/api/share/jobs/${id}/render`));
    } catch (error) {
      setError(error);
      setBusy(false);
    }
  }
  async function primary() {
    if (!job || busy) return;
    if (method === "copy") {
      if (await app.copy(job.text))
        await post(`/api/share/jobs/${job.id}/activity`, {
          action: "copy",
        }).catch(setError);
      return;
    }
    if (method === "export") {
      download(`/api/share/jobs/${job.id}/export`, "Threadline-share.zip");
      setInfo(t("已开始下载文字与附件"));
      return;
    }
    if (method === "cards") {
      if (ready) setResult(true);
      else await makeCards();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post<ShareJob>(`/api/share/jobs/${job.id}/send`);
      setRecord(job.id);
    } catch (error) {
      setError(error);
      setRecord(job.id);
    } finally {
      setBusy(false);
    }
  }
  const methods: [Method, string, string][] = [
    ["copy", t("复制文字"), t("粘贴到微信、邮件或其他应用")],
    ["export", t("保存文件"), t("下载文字与所选附件")],
    ["cards", t("生成图卡"), t("将讨论排成图片，方便转发")],
    ["feishu", t("飞书"), t("发送给同事或群聊")],
    ["slack", "Slack", t("发送到频道或私聊")],
    ["discord", "Discord", t("发送到已连接的频道")],
  ];
  if (method === "feishu")
    return (
      <FeishuShare
        snapshot={snapshot}
        initialNote={note}
        initialPaths={paths}
        onClose={onClose}
        onBusy={onBusy}
        onBack={(note, paths) => {
          setNote(note);
          setPaths(paths);
          setMethod(null);
        }}
      />
    );
  const renderState = render?.state;
  return (
    <>
      <Modal
        title={
          method
            ? methods.find((item) => item[0] === method)![1]
            : t("分享讨论")
        }
        className="share-dialog"
        onClose={onClose}
        busy={busy}
      >
        {!method ? (
          <section className="share-chooser">
            <p className="dialog-hint">{t`已选 ${snapshot.messageIDs.length} 条消息 · 选择一种分享方式`}</p>
            <h3>{t("保存到本机")}</h3>
            <div className="share-method-grid">
              {methods.slice(0, 3).map(([value, label, hint]) => (
                <button
                  className="secondary share-method"
                  key={value}
                  onClick={() => setMethod(value)}
                >
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
            <h3>{t("直接发送")}</h3>
            <div className="share-method-grid">
              {methods.slice(3).map(([value, label, hint]) => (
                <button
                  className="secondary share-method"
                  key={value}
                  onClick={() => setMethod(value)}
                >
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="share-compose">
            <button
              className="tool"
              disabled={busy}
              onClick={() => {
                setMethod(null);
                setError(null);
              }}
            >
              {t("← 更换分享方式")}
            </button>
            {method === "slack" ? (
              <section>
                <h3>{t("发送到")}</h3>
                <p className="dialog-hint">
                  {status?.slack.connected
                    ? t("已连接：") + status.slack.team
                    : t("先在「连接与设置」中连接 Slack。")}
                </p>
                <label className="field-label">
                  {t("Slack 频道或成员 ID")}
                  <input
                    value={target}
                    placeholder="C… / G… / U…"
                    disabled={busy}
                    onChange={(event) => setTarget(event.target.value.trim())}
                  />
                </label>
                <button
                  className="tool"
                  disabled={busy}
                  onClick={() => setTarget("self")}
                >
                  {t("发给自己")}
                </button>
                <button
                  className="tool"
                  disabled={busy || channelBusy}
                  onClick={() => void loadChannels()}
                >
                  {t("加载已加入的频道")}
                </button>
                <div className="share-channel-list">
                  {channels.map((channel) => (
                    <button
                      className="tool"
                      key={channel.id}
                      onClick={() => setTarget(channel.id)}
                    >
                      # {channel.name}
                    </button>
                  ))}
                  {cursor ? (
                    <button
                      className="tool"
                      disabled={channelBusy}
                      onClick={() => void loadChannels(true)}
                    >
                      {t("更多频道")}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
            {method === "discord" ? (
              <p>
                {status?.discord.connected
                  ? t`目标：${status.discord.name || ""} · 频道 ${status.discord.channel || ""}`
                  : t("先连接目标 Discord 频道的 Webhook。")}
              </p>
            ) : null}
            {method === "slack" || method === "discord" ? (
              <details key={method} open={!status?.[method].connected}>
                <summary>{t("连接与设置")}</summary>
                <PlatformConnection
                  platform={method}
                  onChanged={() => void refreshConnection()}
                />
              </details>
            ) : null}
            {method === "cards" ? (
              <>
                <p className="dialog-hint">
                  {t(
                    "首次生成会按需下载图卡引擎，显示下载进度；之后可离线生成。图卡仅在本机处理",
                  )}
                </p>
                <section className="share-theme-section">
                  <h3>{t("图卡主题")}</h3>
                  <div
                    className="share-theme-grid"
                    aria-label={t("选择图卡主题")}
                  >
                    {themes.map((item) => (
                      <button
                        className="secondary share-theme"
                        aria-pressed={theme === item.id}
                        disabled={busy}
                        key={item.id}
                        onClick={() => {
                          setTheme(item.id);
                          try {
                            localStorage.setItem(
                              "threadline.cardTheme",
                              item.id,
                            );
                          } catch {
                            /* current preference retained */
                          }
                        }}
                      >
                        <span
                          className="share-theme-swatch"
                          data-layout={item.layout}
                          style={
                            {
                              "--sample-paper": item.paper,
                              "--sample-ink": item.ink,
                              "--sample-accent": item.accent,
                              "--sample-soft": item.soft,
                            } as React.CSSProperties
                          }
                          aria-hidden="true"
                        >
                          <span className="sample-title">{t("Aa 思续")}</span>
                          <span className="sample-line" />
                          <span className="sample-line" />
                          <span className="sample-quote" />
                        </span>
                        <strong>{t(item.name)}</strong>
                        <span className="share-theme-description">
                          {t(item.description)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <div className="share-mode-picker" aria-label={t("图卡模式")}>
                  {(["pages", "long"] as const).map((value) => (
                    <button
                      className="secondary"
                      key={value}
                      aria-pressed={mode === value}
                      disabled={busy}
                      onClick={() => setMode(value)}
                    >
                      {value === "pages" ? t("分页图卡") : t("单张长图")}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <h3>{t("分享内容")}</h3>
            <label className="field-label" htmlFor="share-note">
              {t("附言")}
            </label>
            <textarea
              id="share-note"
              aria-label={t("分享附言")}
              placeholder={t("附一句说明（可选）")}
              value={note}
              maxLength={2000}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
            {method !== "copy" && preview?.job.attachments.length ? (
              <div className="share-attachments">
                <p className="dialog-hint">{t("附带的图片与文件（可选）")}</p>
                {preview.job.attachments.map((attachment) => (
                  <label key={attachment.id}>
                    <input
                      type="checkbox"
                      checked={
                        attachment.available &&
                        (paths === null || paths.includes(attachment.path))
                      }
                      disabled={busy || !attachment.available}
                      onChange={(event) => {
                        const selected =
                          paths ??
                          preview.job.attachments
                            .filter((item) => item.available)
                            .map((item) => item.path);
                        setPaths(
                          event.target.checked
                            ? [...selected, attachment.path]
                            : selected.filter(
                                (path) => path !== attachment.path,
                              ),
                        );
                      }}
                    />
                    {attachment.kind === "image" && attachment.available ? (
                      <img
                        className="share-attachment-thumb"
                        src={`/api/share/jobs/${preview.job.id}/thumbnails/${attachment.id}`}
                        alt={attachment.name}
                      />
                    ) : null}
                    <span>
                      {attachment.name} ·{" "}
                      {attachment.available
                        ? Math.ceil(attachment.size / 1024) + " KB"
                        : translateError(attachment.problem || "")}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            <details className="share-preview-details">
              <summary>{t("查看完整内容")}</summary>
              <pre className="share-preview carry-preview">
                {job?.text || t("正在准备预览…")}
              </pre>
            </details>
            <div className="share-status" role="status">
              <p>
                {info ||
                  (job
                    ? count(job.messages.length) +
                      " · " +
                      count(
                        job.attachments.filter((item) => item.selected).length,
                        "attachment",
                      ) +
                      (job.steps.length
                        ? t` · 将分 ${job.steps.length} 次发送至 ${job.target}`
                        : "")
                    : t("正在更新预览…"))}
              </p>
            </div>
            {error && preparing ? (
              <button
                className="tool"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("重试预览")}
              </button>
            ) : null}
            <div className="dialog-bottom share-actions">
              <button
                className="primary"
                disabled={
                  busy ||
                  !job ||
                  ((method === "slack" || method === "discord") &&
                    job.platform !== method) ||
                  job.steps.some((step) =>
                    ["sent", "sending", "uncertain"].includes(step.status),
                  )
                }
                onClick={() => void primary()}
              >
                {busy
                  ? t("正在处理…")
                  : method === "copy"
                    ? t("复制文字")
                    : method === "export"
                      ? t("下载文字与附件")
                      : method === "cards"
                        ? ready
                          ? t("查看图卡")
                          : t("生成图卡")
                        : method === "slack"
                          ? t("确认发送到 Slack")
                          : t("确认发送到 Discord")}
              </button>
            </div>
          </section>
        )}
        <ErrorText error={error} />
      </Modal>
      {result ? (
        <Modal
          title={t("图卡预览")}
          className="card-result-dialog"
          onClose={() => setResult(false)}
          busy={busy}
        >
          <div className="card-result-tools">
            <button
              className="tool"
              disabled={busy}
              onClick={() => setResult(false)}
            >
              {t("返回调整")}
            </button>
            <button
              className="secondary"
              disabled={!ready || busy}
              onClick={async () => {
                if (!job) return;
                try {
                  const bytes = fetch(
                    `/api/share/jobs/${job.id}/render/pages/${page}`,
                  ).then((response) => {
                    if (!response.ok) throw new Error(t("图片读取失败"));
                    return response.blob();
                  });
                  await navigator.clipboard.write([
                    new ClipboardItem({ "image/png": bytes }),
                  ]);
                  setInfo(t("已复制图卡"));
                  await post(`/api/share/jobs/${job.id}/activity`, {
                    action: "image-copy",
                  });
                } catch {
                  setInfo(t("此环境无法复制图片，请下载图卡"));
                }
              }}
            >
              {t("复制图卡")}
            </button>
            <button
              className="primary"
              disabled={!ready || busy}
              onClick={() => {
                if (job)
                  download(
                    `/api/share/jobs/${job.id}/${mode === "long" ? "render/pages/0" : "cards"}`,
                    mode === "long"
                      ? "Threadline-long.png"
                      : "Threadline-cards.zip",
                  );
              }}
            >
              {mode === "long" ? t("下载长图 PNG") : t("下载全部图卡")}
            </button>
            {job?.attachments.some((attachment) => attachment.selected) ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  download(
                    `/api/share/jobs/${job.id}/export`,
                    "Threadline-share.zip",
                  )
                }
              >
                {t("下载文字与附件")}
              </button>
            ) : null}
          </div>
          <p role="status">
            {info || translateError(renderState?.message || "")}
          </p>
          {busy ? (
            <div className="share-render-status">
              <progress
                max={100}
                value={
                  renderState?.percent ??
                  (renderState?.total
                    ? ((renderState.completed || 0) / renderState.total) * 100
                    : undefined)
                }
                aria-label={t("图卡生成进度")}
              />
              <button
                className="secondary"
                onClick={() => {
                  if (render)
                    void post(
                      `/api/share/jobs/${render.jobID}/render/cancel`,
                    ).catch(setError);
                }}
              >
                {t("取消生成")}
              </button>
            </div>
          ) : null}
          {ready && job ? (
            <>
              <div className="card-result-pager">
                <button
                  className="secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  {t("上一张")}
                </button>
                <span>
                  {page + 1} / {renderState?.total || 1}
                </span>
                <button
                  className="secondary"
                  disabled={page >= (renderState?.total || 1) - 1}
                  onClick={() => setPage(page + 1)}
                >
                  {t("下一张")}
                </button>
              </div>
              <div className="share-cards">
                <figure>
                  <img
                    src={`/api/share/jobs/${job.id}/render/pages/${page}`}
                    alt={
                      mode === "long"
                        ? t("完整长图")
                        : t`图卡 ${page + 1} / ${renderState?.total || 1}`
                    }
                  />
                </figure>
              </div>
            </>
          ) : !busy ? (
            <button
              className="primary"
              disabled={!job}
              onClick={() => void makeCards()}
            >
              {t("重试生成")}
            </button>
          ) : null}
          <ErrorText error={error} />
        </Modal>
      ) : null}
      {record ? (
        <ShareHistory
          initialID={record}
          onClose={() => {
            setRecord("");
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
