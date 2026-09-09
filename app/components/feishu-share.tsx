import { useEffect, useState } from "react";
import { api, post } from "../lib/api";
import { t, tr, translateError } from "../lib/i18n";
import type { FeishuPreview, FeishuStatus, Snapshot } from "../lib/types";
import { Modal } from "./modal";
import { ErrorText, useDebounced } from "./common";
import { FeishuConnection } from "./connections";

export function FeishuShare({
  snapshot,
  initialNote,
  initialPaths,
  onClose,
  onBack,
  onBusy,
}: {
  snapshot: Snapshot;
  initialNote: string;
  initialPaths: string[] | null;
  onClose(): void;
  onBack(note: string, paths: string[] | null): void;
  onBusy?(busy: boolean): void;
}) {
  const [note, setNote] = useState(initialNote),
    [paths, setPaths] = useState(initialPaths),
    [target, setTarget] = useState<"self" | "group">("self");
  const [status, setStatus] = useState<FeishuStatus | null>(null),
    [connection, setConnection] = useState(false),
    [error, setError] = useState<unknown>(),
    [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      key: string;
      value: FeishuPreview;
    } | null>(null),
    [revision, setRevision] = useState(0),
    [consumed, setConsumed] = useState("");
  const [users, setUsers] = useState<
      { id: string; name: string; department?: string }[]
    >([]),
    [user, setUser] = useState("self"),
    [userQuery, setUserQuery] = useState(""),
    [contactAuth, setContactAuth] = useState(false),
    [searchBusy, setSearchBusy] = useState(false);
  const [chats, setChats] = useState<{ id: string; name: string }[]>([]),
    [chat, setChat] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [cursor, setCursor] = useState("");
  const key = JSON.stringify({ snapshot, note, paths });
  const debounced = useDebounced(key);
  const current =
    preview?.key === key && preview.value.id !== consumed
      ? preview.value
      : null;
  const ready =
    target === "self" ? status?.privateReady : status?.ready && !!chat;
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  useEffect(() => {
    const controller = new AbortController();
    void api<FeishuStatus>("/api/feishu/status", { signal: controller.signal })
      .then(setStatus)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (key !== debounced) return;
    const controller = new AbortController();
    setError(null);
    setInfo("");
    const prepare = async () => {
      let result = await post<FeishuPreview>(
        "/api/feishu/preview",
        { ...snapshot, note, attachmentIDs: [] },
        "POST",
        controller.signal,
      );
      const selected = result.attachments
        .filter(
          (attachment) =>
            attachment.available &&
            (paths === null || paths.includes(attachment.path)),
        )
        .map((attachment) => attachment.id);
      if (selected.length)
        result = await post<FeishuPreview>(
          "/api/feishu/preview",
          { ...snapshot, note, attachmentIDs: selected },
          "POST",
          controller.signal,
        );
      if (!controller.signal.aborted) setPreview({ key, value: result });
    };
    void prepare().catch((error) => {
      if (!controller.signal.aborted) setError(error);
    });
    return () => controller.abort();
  }, [key, debounced, snapshot, note, paths, revision]);
  useEffect(() => {
    if (target !== "group" || !status?.ready) return;
    const controller = new AbortController();
    setChat("");
    setChats([]);
    void api<{ chats: { id: string; name: string }[]; pageToken: string }>(
      "/api/feishu/chats?q=" + encodeURIComponent(search),
      { signal: controller.signal },
    )
      .then((result) => {
        setChats(result.chats);
        setCursor(result.pageToken);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, [target, status?.ready, search, revision]);
  async function searchUsers() {
    if (busy || searchBusy) return;
    setSearchBusy(true);
    setError(null);
    try {
      const result = await api<{
        users: { id: string; name: string; department?: string }[];
        hasMore: boolean;
      }>("/api/feishu/users?q=" + encodeURIComponent(userQuery));
      setUsers(result.users);
      setUser("self");
      setContactAuth(false);
      setInfo(
        result.hasMore
          ? t("结果较多，请补充姓名或邮箱缩小范围。")
          : result.users.length
            ? t("请选择收件人。")
            : t("没有找到同事。"),
      );
    } catch (error) {
      setError(error);
      setContactAuth(true);
    } finally {
      setSearchBusy(false);
    }
  }
  async function moreChats() {
    if (searchBusy) return;
    setSearchBusy(true);
    try {
      const result = await api<{
        chats: { id: string; name: string }[];
        pageToken: string;
      }>(
        "/api/feishu/chats?q=" +
          encodeURIComponent(search) +
          "&page=" +
          encodeURIComponent(cursor),
      );
      setChats((previous) => [
        ...new Map(
          [...previous, ...result.chats].map((chat) => [chat.id, chat]),
        ).values(),
      ]);
      setCursor(result.pageToken);
    } catch (error) {
      setError(error);
    } finally {
      setSearchBusy(false);
    }
  }
  async function deliver() {
    if (!current || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const receipt = await post<{ sentCount: number }>("/api/feishu/send", {
        previewId: current.id,
        target: target === "self" && user !== "self" ? "user" : target,
        userId: user,
        ...(target === "group" ? { chatId: chat } : {}),
      });
      setConsumed(current.id);
      setInfo(
        tr(
          `已发送 ${receipt.sentCount} 张卡片，原来的消息选择仍然保留`,
          `${receipt.sentCount} cards sent. Your message selection is retained`,
        ),
      );
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={t("发到飞书")}
        className="feishu-dialog feishu-send-dialog"
        onClose={onClose}
        busy={busy}
      >
        <button
          className="tool"
          disabled={busy}
          onClick={() => onBack(note, paths)}
        >
          {t("← 更换分享方式")}
        </button>
        <section className="share-recipient-section">
          <h3>{t("发送到")}</h3>
          <div
            className="feishu-target-switch"
            role="group"
            aria-label={t("发送目标")}
          >
            <button
              className="secondary"
              disabled={busy}
              aria-pressed={target === "self"}
              onClick={() => setTarget("self")}
            >
              {t("私聊")}
            </button>
            <button
              className="secondary"
              disabled={busy}
              aria-pressed={target === "group"}
              onClick={() => setTarget("group")}
            >
              {t("群聊")}
            </button>
          </div>
          {target === "self" ? (
            <>
              <p className="dialog-hint">
                {t("收件人：")}
                {user === "self"
                  ? status?.userName || t("当前飞书用户")
                  : users.find((item) => item.id === user)?.name}
              </p>
              <select
                className="topic-select"
                aria-label={t("私聊收件人")}
                disabled={busy}
                value={user}
                onChange={(event) => setUser(event.target.value)}
              >
                <option value="self">{t("我（当前飞书用户）")}</option>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.department || ""} · {item.id.slice(-6)}
                  </option>
                ))}
              </select>
              <details>
                <summary>{t("查找其他同事")}</summary>
                <input
                  aria-label={t("搜索收件人")}
                  placeholder={t("搜索同事姓名或邮箱")}
                  value={userQuery}
                  disabled={busy}
                  onChange={(event) => setUserQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchUsers();
                    }
                  }}
                />
                <button
                  className="tool"
                  disabled={busy || searchBusy}
                  onClick={() => void searchUsers()}
                >
                  {t("搜索同事")}
                </button>
                {contactAuth ? (
                  <button
                    className="tool"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await post("/api/feishu/authorize", { contacts: true });
                        setConnection(true);
                      } catch (error) {
                        setError(error);
                      }
                    }}
                  >
                    {t("授权搜索同事")}
                  </button>
                ) : null}
              </details>
            </>
          ) : (
            <>
              <label className="field-label">
                {t("搜索飞书群聊")}
                <input
                  value={query}
                  disabled={busy}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSearch(query);
                  }}
                />
              </label>
              <button
                className="tool"
                disabled={busy}
                onClick={() => setSearch(query)}
              >
                {t("搜索")}
              </button>
              <select
                className="topic-select"
                aria-label={t("发送到哪个群")}
                disabled={busy}
                value={chat}
                onChange={(event) => setChat(event.target.value)}
              >
                <option value="">{t("请选择群聊")}</option>
                {chats.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {cursor ? (
                <button
                  className="tool"
                  disabled={busy || searchBusy}
                  onClick={() => void moreChats()}
                >
                  {t("加载更多群")}
                </button>
              ) : null}
            </>
          )}
        </section>
        <details
          className="share-connection-details"
          open={!(target === "self" ? status?.privateReady : status?.ready)}
        >
          <summary>{t("飞书连接")}</summary>
          <p className="dialog-hint">
            {ready
              ? t("发送身份：") + (status?.botName || t("Threadline 机器人"))
              : t("请先开通机器人发送权限，并授权群列表。")}
          </p>
          <button
            className="tool"
            disabled={busy}
            onClick={() => setConnection(true)}
          >
            {t("连接 / 管理飞书")}
          </button>
        </details>
        <h3>{t("分享内容")}</h3>
        <label className="field-label" htmlFor="feishu-share-note">
          {t("附言（可选）")}
        </label>
        <textarea
          id="feishu-share-note"
          aria-label={t("发送附言")}
          maxLength={2000}
          disabled={busy}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {preview?.value.attachments.length ? (
          <div className="feishu-attachments">
            <p>{t("附件（勾选后上传；未选附件只注明未发送）")}</p>
            {preview.value.attachments.map((attachment) => (
              <label className="feishu-attachment" key={attachment.id}>
                <input
                  type="checkbox"
                  disabled={busy || !attachment.available}
                  checked={
                    attachment.available &&
                    (paths === null || paths.includes(attachment.path))
                  }
                  onChange={(event) => {
                    const selected =
                      paths ??
                      preview.value.attachments
                        .filter((item) => item.available)
                        .map((item) => item.path);
                    setPaths(
                      event.target.checked
                        ? [...selected, attachment.path]
                        : selected.filter((path) => path !== attachment.path),
                    );
                  }}
                />
                {attachment.available && attachment.kind === "image" ? (
                  <img
                    className="share-attachment-thumb"
                    alt={attachment.name}
                    src={
                      "/api/local-resource?" +
                      new URLSearchParams({
                        path: attachment.path,
                        thread: snapshot.threadID,
                        runtime: snapshot.runtime,
                      })
                    }
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
            {status?.uploadPermissionUrl ? (
              <button
                className="tool"
                disabled={busy}
                onClick={async () => {
                  try {
                    await post("/api/feishu/permissions", { kind: "upload" });
                    setConnection(true);
                  } catch (error) {
                    setError(error);
                  }
                }}
              >
                {t("一键申请图片 / 文件上传权限")}
              </button>
            ) : null}
          </div>
        ) : null}
        <details className="share-preview-details">
          <summary>{t("查看完整内容")}</summary>
          <pre className="feishu-preview">
            {current?.text ||
              (consumed ? preview?.value.text : t("正在更新预览…"))}
          </pre>
        </details>
        <p className="dialog-hint" role="status">
          {info ||
            (current
              ? t`${current.count} 条消息 · 将发送 ${current.cardCount} 张折叠卡片 + ${current.fileCount || 0} 个文件。长消息分段保留原文。`
              : "")}
        </p>
        <ErrorText error={error} />
        {!current && !consumed && error ? (
          <button
            className="tool"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("重试预览")}
          </button>
        ) : null}
        <div className="dialog-bottom">
          <button
            className="primary"
            disabled={busy || !current || !ready}
            onClick={() => void deliver()}
          >
            {busy ? t("正在发送…") : t("确认发送到飞书")}
          </button>
        </div>
      </Modal>
      {connection ? (
        <FeishuConnection
          onClose={() => {
            setConnection(false);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
    </>
  );
}
