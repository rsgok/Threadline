import { WindowHeading } from "../components/window-heading";
import { useSearchParams } from "react-router";
import { AboutSettings } from "../components/about-settings";
import { useState } from "react";
import { getLanguage, setLanguage, t } from "../lib/i18n";
import type { Language } from "../lib/types";
import {
  FeishuConnection,
  PlatformConnection,
} from "../components/connections";
import { ErrorText } from "../components/common";
import "../../web/feishu.css";

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const about = params.get("section") === "about";
  const [language, set] = useState<Language>(getLanguage()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [feishu, setFeishu] = useState(false),
    [open, setOpen] = useState({ slack: false, discord: false });
  return (
    <section className="settings-page route-scroll" aria-label={t("设置")}>
      <div className="settings-content">
        <div className="settings-heading">
          <WindowHeading><h1>{t("设置")}</h1></WindowHeading>
        </div>
        <nav className="settings-tabs" aria-label={t("设置分类")}>
          <button className="tool" aria-pressed={!about} onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("section"); return next; })}>{t("通用")}</button>
          <button className="tool" aria-pressed={about} onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.set("section", "about"); return next; })}>{t("关于")}</button>
        </nav>
        {about ? <AboutSettings /> : <>
        <section className="settings-section">
          <h2>{t("通用")}</h2>
          <label className="field-label" htmlFor="language-choice">
            {t("界面语言")}
          </label>
          <p className="dialog-hint">{t("选择界面语言，笔记和对话保持原文")}</p>
          <select
            className="topic-select"
            id="language-choice"
            value={language}
            onChange={(event) => set(event.target.value as Language)}
            disabled={busy}
          >
            <option value="system">{t("跟随系统")}</option>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              try {
                setLanguage(language);
                window.location.reload();
              } catch (error) {
                setError(error);
                setBusy(false);
              }
            }}
          >
            {t("应用并重新加载")}
          </button>
          <ErrorText error={error} />
        </section>
        <section className="settings-section">
          <h2>{t("连接与集成")}</h2>
          <p className="dialog-hint">{t("管理分享讨论时使用的应用连接")}</p>
          <div className="settings-integrations">
            <details className="settings-connection" onToggle={event => setFeishu(event.currentTarget.open)}>
              <summary>{t("飞书")}</summary>
              {feishu ? <FeishuConnection inline /> : null}
            </details>
            {(["slack", "discord"] as const).map((platform) => (
              <details
                className="settings-connection"
                key={platform}
                onToggle={(event) => {
                  const value = event.currentTarget.open;
                  setOpen((previous) => ({ ...previous, [platform]: value }));
                }}
              >
                <summary>{platform === "slack" ? "Slack" : "Discord"}</summary>
                {open[platform] ? (
                  <PlatformConnection platform={platform} />
                ) : null}
              </details>
            ))}
          </div>
        </section>
        </>}
      </div>
    </section>
  );
}
