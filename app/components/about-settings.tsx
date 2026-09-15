import { useEffect, useState } from "react";
import { t } from "../lib/i18n";

type UpdateState = {
  state: string;
  version?: string;
  nativeVersion?: string;
  nativeBuild?: string;
  configured?: boolean;
  automatic?: boolean;
  lastChecked?: number;
  error?: string;
  blocked?: "node" | "shell";
  release?: { version: string; notes: string; size: number };
};
const request = (action: string, extra = {}) =>
  window.webkit?.messageHandlers?.updates?.postMessage({ action, ...extra });

export function AboutSettings() {
  const [native, setNative] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ state: "loading" });
  useEffect(() => {
    const available = !!window.webkit?.messageHandlers?.updates;
    setNative(available);
    if (!available) return;
    const receive = (event: Event) => setUpdate((event as CustomEvent<UpdateState>).detail);
    window.addEventListener("threadline-updates", receive);
    request("status");
    return () => window.removeEventListener("threadline-updates", receive);
  }, []);
  const busy = ["loading", "checking", "installing"].includes(update.state);
  const messages: Record<string, string> = {
    loading: "正在读取版本信息…",
    shell: "请在更新窗口中查看 Mac 程序更新",
    idle: "检查是否有可用更新",
    checking: "正在检查更新…",
    installing: "正在下载并安装更新，请稍候…",
    current: "功能包已是最新版本",
    installed: "更新已安装",
    unconfigured: "此版本尚未配置在线更新",
    error: "更新未完成，请重试",
  };
  return (
    <section className="settings-section about-settings" aria-labelledby="about-title">
      <div className="about-identity">
        <img src="/assets/threadline-icon.png" alt="" width="48" height="48" />
        <div><h2 id="about-title">Threadline</h2><p className="dialog-hint">{t("思续，让思考继续")}</p></div>
      </div>
      {native ? <>
        <dl className="about-versions">
          <div><dt>{t("Mac 版本")}</dt><dd>{update.nativeVersion ?? "—"}{update.nativeBuild ? ` (${update.nativeBuild})` : ""}</dd></div>
          <div><dt>{t("功能版本")}</dt><dd>{update.version ?? "—"}</dd></div>
        </dl>
        <div className="about-update-status" role="status" aria-live="polite">
          {update.state === "available" ? <>
            <p>{t("发现新版本")} {update.release?.version}</p>
            <p className="dialog-hint">{t("仅下载所需功能包")} · {((update.release?.size ?? 0) / 1024 / 1024).toFixed(1)} MB</p>
          </> : update.state === "incompatible" ? <p>{t(update.blocked === "shell" ? "请先完成 Mac 程序更新，再更新功能包" : "请先更新 Mac 程序，应用会自动准备所需运行环境")}</p>
            : <p>{t(update.configured === false && !busy ? "此版本尚未配置在线更新" : messages[update.state] ?? "检查是否有可用更新")}</p>}
          {update.lastChecked ? <p className="dialog-hint">{t("上次检查")} · {new Date(update.lastChecked * 1000).toLocaleString()}</p> : null}
          {update.error ? <details><summary>{t("错误详情")}</summary><p className="dialog-error">{update.error}</p></details> : null}
        </div>
        {update.release?.notes ? <details className="settings-connection"><summary>{t("更新说明")}</summary><p className="about-release-notes">{update.release.notes}</p></details> : null}
        <div className="about-actions">
          <button className={update.state === "available" ? "secondary" : "primary"} disabled={busy || !update.configured} onClick={() => request("check")}>{t("检查更新")}</button>
          {update.state === "available" ? <button className="primary" disabled={busy} onClick={() => request("install")}>{t("下载并更新")}</button> : null}
        </div>
        <label className="about-automatic"><input type="checkbox" role="switch" checked={update.automatic ?? false} disabled={!update.configured || busy} onChange={(event) => request("automatic", { enabled: event.target.checked })} />{t("自动检查更新")}</label>
        <p className="dialog-hint">{t("每天检查一次，安装前由你确认")}</p>
        <button className="tool" onClick={() => request("openData")}>{t("打开数据文件夹")}</button>
      </> : <p className="dialog-hint">{t("请在新版 Threadline Mac 程序中检查和安装更新")}</p>}
    </section>
  );
}
