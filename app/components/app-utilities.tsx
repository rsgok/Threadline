import { useEffect, useRef } from "react";
import { t } from "../lib/i18n";
import type { Runtime } from "../lib/types";

export function AppUtilities({
  openInRuntime,
  history,
}: {
  openInRuntime(runtime?: Runtime): Promise<void>;
  history(): void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <details className="session-more app-more" ref={ref}>
      <summary aria-label={t("更多应用操作")}>•••</summary>
      <div
        className="session-more-body"
        onClick={(event) => {
          if ((event.target as Element).closest("button") && ref.current)
            ref.current.open = false;
        }}
      >
        <button className="tool" onClick={() => void openInRuntime("codex")}>
          {t("在 Codex 中打开 ↗")}
        </button>
        <button className="tool" onClick={() => void openInRuntime("cursor")}>
          {t("在 Cursor 中打开 ↗")}
        </button>
        <button className="tool" onClick={history}>
          {t("分享记录")}
        </button>
      </div>
    </details>
  );
}
