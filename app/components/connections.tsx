import { useEffect, useState } from "react";
import { api, post } from "../lib/api";
import { t, tr } from "../lib/i18n";
import type { FeishuStatus, ShareStatus } from "../lib/types";
import { Modal } from "./modal";
import { ErrorText, Loading } from "./common";

export function PlatformConnection({
  platform,
  onChanged,
}: {
  platform: "slack" | "discord";
  onChanged?(): void;
}) {
  const [status, setStatus] = useState<ShareStatus | null>(null),
    [credential, setCredential] = useState(""),
    [self, setSelf] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    const controller = new AbortController();
    void api<ShareStatus>("/api/share/status", { signal: controller.signal })
      .then((result) => {
        setStatus(result);
        setSelf(result.slack.selfUserId || "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, []);
  async function run(disconnect = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const data = disconnect
      ? { platform }
      : platform === "slack"
        ? { platform, token: credential.trim(), selfUserId: self.trim() }
        : { platform, webhook: credential.trim() };
    setCredential("");
    try {
      await post("/api/share/" + (disconnect ? "disconnect" : "connect"), data);
      setStatus(await api<ShareStatus>("/api/share/status"));
      onChanged?.();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="platform-connection">
      <p className="dialog-hint">
        {status?.[platform].connected
          ? t("已连接：") +
            (platform === "slack" ? status.slack.team : status.discord.name)
          : t("未连接")}
      </p>
      <p className="dialog-hint">
        {platform === "slack"
          ? t(
              "在 Slack 创建应用并安装到工作区。机器人需要 chat:write、files:write；列出频道需 channels:read、groups:read，私聊需 im:write。将机器人加入目标频道。",
            )
          : t(
              "在 Discord 目标频道的「编辑频道 → 整合 → Webhook」创建并复制地址。只会发送到该频道。",
            )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label className="field-label">
          {platform === "slack" ? "Slack Bot Token" : "Discord Webhook URL"}
          <input
            type="password"
            autoComplete="off"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            disabled={busy}
            required
            placeholder={
              platform === "slack"
                ? "xoxb-…"
                : "https://discord.com/api/webhooks/…"
            }
          />
        </label>
        {platform === "slack" ? (
          <label className="field-label">
            {t("我的 Slack 成员 ID（可选）")}
            <input
              value={self}
              onChange={(event) => setSelf(event.target.value)}
              disabled={busy}
              placeholder="U…"
            />
          </label>
        ) : null}
        <p className="dialog-hint">
          {t("凭证仅保存在本机，配置文件仅当前系统用户可读。")}
        </p>
        <div className="hero-actions">
          <button className="secondary" disabled={busy}>
            {t("验证并保存")}
          </button>
          {status?.[platform].connected ? (
            <button
              className="tool"
              type="button"
              disabled={busy}
              onClick={() => void run(true)}
            >
              {t("断开此连接")}
            </button>
          ) : null}
        </div>
      </form>
      <ErrorText error={error} />
    </section>
  );
}
export function FeishuConnection({
  onClose,
  onChanged,
}: {
  onClose(): void;
  onChanged?(): void;
}) {
  const [status, setStatus] = useState<FeishuStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [info, setInfo] = useState("");
  const [appID, setAppID] = useState(""),
    [secret, setSecret] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await api<FeishuStatus>("/api/feishu/status", {
          signal: controller.signal,
        });
        setStatus(next);
      } catch (error) {
        if (!controller.signal.aborted) setError(error);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function run(action: string, data = {}) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo("");
    try {
      await post("/api/feishu/" + action, data);
      setStatus(await api<FeishuStatus>("/api/feishu/status"));
      onChanged?.();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  const waiting =
    status?.job && ["starting", "waiting"].includes(status.job.status);
  return (
    <Modal
      title={t("连接飞书")}
      className="feishu-dialog"
      onClose={() => {
        onChanged?.();
        onClose();
      }}
      busy={busy}
    >
      {!status ? (
        <Loading />
      ) : waiting ? (
        <>
          <p className="dialog-hint">
            {status.job?.kind === "create"
              ? t("用飞书扫码，创建你的 Threadline 应用。")
              : status.job?.kind === "permissions"
                ? t("用飞书扫码，为当前 Threadline 应用补开权限。")
                : t(
                    "用飞书扫码，授权读取群列表；消息由你的 Threadline 机器人发送。",
                  )}
          </p>
          {status.job?.qr ? (
            <>
              <img
                className="feishu-qr"
                src={status.job.qr}
                alt={t("飞书授权二维码")}
              />
              <ExternalLink href={status.job.url}>
                {t("打开飞书确认页面 ↗")}
              </ExternalLink>
            </>
          ) : (
            <p>{t("正在获取二维码…")}</p>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void run("cancel")}
          >
            {t("取消本次连接")}
          </button>
        </>
      ) : !status.connected ? (
        <>
          <p className="dialog-hint">
            {t(
              "创建你自己的飞书应用，将选中的 AI 讨论分享给同事。应用凭证独立保存，不使用 Peer 的账号配置。",
            )}
          </p>
          {!status.recoveryAppId ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run("create")}
            >
              {t("扫码创建专属应用")}
            </button>
          ) : (
            <p>
              {tr(
                `应用 ${status.recoveryAppId} 已创建，请绑定凭证恢复`,
                `App ${status.recoveryAppId} was created. Bind its credentials to recover`,
              )}
            </p>
          )}
          <details
            className="feishu-existing"
            open={status.recoveryAppId ? true : undefined}
          >
            <summary>{t("绑定已有应用")}</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = secret;
                setSecret("");
                void run("bind", {
                  appId: status.recoveryAppId || appID.trim(),
                  appSecret: value,
                });
              }}
            >
              <label className="field-label">
                App ID
                <input
                  aria-label="App ID"
                  value={status.recoveryAppId || appID}
                  readOnly={!!status.recoveryAppId}
                  onChange={(event) => setAppID(event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="field-label">
                App Secret
                <input
                  aria-label="App Secret"
                  type="password"
                  autoComplete="off"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <button className="primary" disabled={busy}>
                {t("绑定应用")}
              </button>
            </form>
          </details>
          <p className="dialog-hint">
            {t(
              "本版使用本机 lark-cli 保存独立凭证和完成用户授权；不上传到 Threadline 服务器。",
            )}
          </p>
        </>
      ) : (
        <>
          <p>
            {t("应用 · ")}
            {status.appId}
          </p>
          <p>
            {status.userAuthorized
              ? t("账号 · ") + (status.userName || t("飞书用户"))
              : t("下一步：授权读取你的群列表。")}
          </p>
          {status.missingBotScopes?.length ? (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void run("permissions", { kind: "send" })}
              >
                {t("一键申请机器人发送权限")}
              </button>
              <ExternalLink href={status.permissionUrl}>
                {t("权限管理（备用）↗")}
              </ExternalLink>
            </>
          ) : null}
          {!status.userAuthorized || status.missingScopes?.length ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run("authorize")}
            >
              {status.userAuthorized ? t("补充群列表授权") : t("授权群列表")}
            </button>
          ) : null}
          <p className="dialog-hint">
            {t(
              "机器人需要加入目标群。开通权限并按飞书要求发布后，点击下方刷新。",
            )}
          </p>
          <ExternalLink href={status.consoleUrl}>
            {t("打开应用后台 ↗")}
          </ExternalLink>
          <div className="hero-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setStatus(
                    await api<FeishuStatus>("/api/feishu/status?refresh=1"),
                  );
                  onChanged?.();
                } catch (error) {
                  setError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("刷新权限状态")}
            </button>
            {status.ready ? (
              <button
                className="tool"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await api<{ chats: unknown[] }>(
                      "/api/feishu/chats",
                    );
                    setInfo(
                      tr(
                        `读取成功，本页返回 ${result.chats.length} 个群`,
                        `Loaded ${result.chats.length} chats`,
                      ),
                    );
                  } catch (error) {
                    setError(error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("验证群列表")}
              </button>
            ) : null}
            <button
              className="tool"
              disabled={busy}
              onClick={() => void run("disconnect")}
            >
              {t("断开本机连接")}
            </button>
          </div>
          <p className="dialog-hint">
            {t(
              "断开会清除本机用户登录态，不删除飞书应用，也不撤销服务端授权。",
            )}
          </p>
        </>
      )}
      <ErrorText
        error={
          error ||
          status?.connectionError ||
          status?.botScopeError ||
          (status?.job?.status === "failed" ? status.job.message : null)
        }
      />
      {info ? <p role="status">{info}</p> : null}
    </Modal>
  );
}
export function ExternalLink({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  return href && /^https?:\/\//.test(href) ? (
    <a className="tool" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : null;
}
