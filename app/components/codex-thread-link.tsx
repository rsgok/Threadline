import { tr } from "../lib/i18n";

export function CodexThreadLink({ threadID }: { threadID: string }) {
  const panel = new URL(
    `/collect/codex/${encodeURIComponent(threadID)}?panel=1`,
    window.location.origin,
  );
  const link = new URL(`codex://threads/${encodeURIComponent(threadID)}`);
  link.searchParams.set("browserUrl", panel.href);
  return (
    <a
      className="tool codex-thread-link"
      href={link.href}
      title={tr("打开 Codex 原对话，并在右侧显示本页", "Open the Codex conversation with this page alongside")}
      onClick={(event) => {
        const bridge = window.webkit?.messageHandlers?.openInCodex;
        if (bridge) {
          event.preventDefault();
          bridge.postMessage({ runtime: "codex", threadID, url: panel.href });
        }
      }}
    >
      {tr("在 Codex 继续 ↗", "Continue in Codex ↗")}
    </a>
  );
}
