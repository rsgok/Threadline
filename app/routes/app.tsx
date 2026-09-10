import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation, useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/app";
import { api, errorMessage, post } from "../lib/api";
import {
  AppContext,
  type AppContextValue,
  type SessionDraft,
} from "../lib/app-context";
import { initializeLanguage, t, tr } from "../lib/i18n";
import { usePageHistory } from "../lib/use-page-history";
import { surfacePath } from "../lib/navigation";
import { useNativeBridge } from "../lib/native";
import type { Library, Runtime, Topic } from "../lib/types";
import { Icon } from "../components/common";
import { AppUtilities } from "../components/app-utilities";
import { Modal } from "../components/modal";

const CaptureDialog = lazy(() =>
  import("../components/library-dialogs").then((m) => ({
    default: m.CaptureDialog,
  })),
);
const TopicDialog = lazy(() =>
  import("../components/library-dialogs").then((m) => ({
    default: m.TopicDialog,
  })),
);
const CarryDialog = lazy(() =>
  import("../components/library-dialogs").then((m) => ({
    default: m.CarryDialog,
  })),
);
const ShareHistory = lazy(() =>
  import("../components/share-history").then((m) => ({
    default: m.ShareHistory,
  })),
);

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  initializeLanguage();
  return api<Library>("/api/library", { signal: request.signal });
}

export default function App({ loaderData: library }: Route.ComponentProps) {
  const location = useLocation(),
    navigate = useNavigate(),
    revalidator = useRevalidator();
  const pageHistory = usePageHistory();
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [capture, setCapture] = useState<{
    topicID?: string;
    text?: string;
    image?: File;
  } | null>(null);
  const [topic, setTopic] = useState<{ value?: Topic } | null>(null),
    [carrying, setCarrying] = useState(false),
    [history, setHistory] = useState(false),
    [copy, setCopy] = useState<string | null>(null);
  const [carry, setCarry] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem("threadline-carry") || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const drafts = useRef(new Map<string, SessionDraft>());
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState("all"),
    [sidebarHidden, setSidebarHidden] = useState(false);
  const [width, setWidth] = useState(() => {
    try {
      return Math.max(
        240,
        Math.min(
          440,
          Number(localStorage.getItem("threadline-sidebar-width")) || 300,
        ),
      );
    } catch {
      return 300;
    }
  });
  const collecting = location.pathname.startsWith("/collect"),
    settings = location.pathname === "/settings",
    thoughts = location.pathname.startsWith("/thoughts");
  const isPanel = new URLSearchParams(location.search).get("panel") === "1";
  const selectedID = location.pathname.startsWith("/notes/")
    ? decodeURIComponent(location.pathname.slice(7))
    : "";
  const href = useCallback(
    (path: string) => surfacePath(path, location.search),
    [location.search],
  );
  const go = useCallback(
    (path: string) => {
      if (href(path) !== location.pathname + location.search)
        void navigate(href(path));
    },
    [navigate, href, location.pathname, location.search],
  );
  const notify = useCallback(
    (text: string, error = false) => setNotice({ text, error }),
    [],
  );
  const { revalidate } = revalidator;
  const refresh = useCallback(async () => {
    await revalidate();
  }, [revalidate]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.error ? 12000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    try {
      sessionStorage.setItem("threadline-carry", JSON.stringify(carry));
    } catch {
      /* current selection remains */
    }
  }, [carry]);
  useLayoutEffect(() => {
    document.body.classList.add("react-app", "native-app");
    document.body.classList.toggle("collecting", collecting);
    document.body.classList.toggle("managing-topics", thoughts);
    document.body.classList.toggle("settings-open", settings);
    document.body.classList.toggle("native-nav-hidden", sidebarHidden);
    document.documentElement.dataset.surface = isPanel ? "panel" : "app";
    document.documentElement.dataset.native = String(
      new URLSearchParams(location.search).get("native") === "1",
    );
  }, [collecting, thoughts, settings, sidebarHidden, isPanel, location.search]);
  useLayoutEffect(
    () => () => {
      document.body.classList.remove(
        "react-app",
        "native-app",
        "collecting",
        "managing-topics",
        "settings-open",
        "native-nav-hidden",
      );
    },
    [],
  );
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--native-sidebar-width",
      `${width}px`,
    );
  }, [width]);
  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify(t("已复制，粘贴到当前 AI 对话即可"));
        return true;
      } catch {
        setCopy(text);
        return false;
      }
    },
    [notify],
  );
  const openInRuntime = useCallback(
    async (runtime: Runtime = "codex") => {
      const url = new URL(
        location.pathname + location.search,
        window.location.origin,
      );
      url.searchParams.delete("native");
      url.searchParams.set("panel", "1");
      try {
        await navigator.clipboard.writeText(url.href);
        window.webkit?.messageHandlers?.openInCodex?.postMessage({
          url: url.href,
          runtime,
        });
        notify(
          runtime === "cursor"
            ? t("链接已复制：在 Cursor Agents 右侧 Browser 中粘贴打开")
            : tr("侧栏链接已复制", "Panel link copied"),
        );
      } catch (error) {
        setCopy(url.href);
      }
    },
    [location.pathname, location.search, notify],
  );
  const commands = useMemo(
    () => ({
      capture: (text?: string) => setCapture({ text }),
      collect: () => go("/collect"),
      library: () => go("/library"),
      search: () => go("/collect?search=1"),
      settings: () => go("/settings"),
      openInRuntime: (runtime?: Runtime) => {
        void openInRuntime(runtime);
      },
    }),
    [go, openInRuntime, location.pathname, location.search],
  );
  useNativeBridge(commands);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        commands.search();
      }
      if (event.ctrlKey && event.altKey && event.code === "KeyS") {
        event.preventDefault();
        commands.capture();
      }
      if (event.ctrlKey && event.altKey && event.code === "KeyR") {
        event.preventDefault();
        commands.library();
      }
      if (event.key === "Tab" || event.key.startsWith("Arrow"))
        document.documentElement.dataset.inputMode = "keyboard";
    };
    const pointer = () => {
      document.documentElement.dataset.inputMode = "pointer";
    };
    const paste = (event: ClipboardEvent) => {
      if (
        (event.target as Element)?.closest(
          "input,textarea,[contenteditable=true]",
        ) ||
        document.querySelector("dialog[open]")
      )
        return;
      const image = [...(event.clipboardData?.files || [])].find((file) =>
        file.type.startsWith("image/"),
      );
      const text = event.clipboardData?.getData("text/plain");
      if (text || image) {
        event.preventDefault();
        setCapture({ text, image });
      }
    };
    const drag = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const image = event.dataTransfer?.files[0];
      if (image) {
        event.preventDefault();
        setCapture({ image });
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("paste", paste);
    document.addEventListener("dragover", drag);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("paste", paste);
      document.removeEventListener("dragover", drag);
      document.removeEventListener("drop", drop);
    };
  }, [commands]);
  const context: AppContextValue = {
    library,
    refresh,
    go,
    href,
    notify,
    capture: (topicID, text, image) => setCapture({ topicID, text, image }),
    editTopic: (value) => setTopic({ value }),
    carry,
    toggleCarry: (id) =>
      setCarry((previous) =>
        previous.includes(id)
          ? previous.filter((value) => value !== id)
          : [...previous, id],
      ),
    openCarry: (ids) => {
      if (ids) setCarry((previous) => [...new Set([...previous, ...ids])]);
      setCarrying(true);
    },
    copy: copyText,
    openInRuntime,
    openHistory: () => setHistory(true),
    getSessionDraft: (key) => {
      if (!drafts.current.has(key)) {
        let saved: Partial<SessionDraft> = {};
        try {
          saved = JSON.parse(
            sessionStorage.getItem("threadline-session:" + key) || "{}",
          );
        } catch {
          /* new draft */
        }
        drafts.current.set(key, {
          selected: Array.isArray(saved.selected)
            ? saved.selected.filter(
                (id): id is string => typeof id === "string",
              )
            : [],
          title: typeof saved.title === "string" ? saved.title : "",
          note: typeof saved.note === "string" ? saved.note : "",
          topicID: typeof saved.topicID === "string" ? saved.topicID : "",
          includeProgress: saved.includeProgress === true,
        });
      }
      return drafts.current.get(key)!;
    },
    saveSessionDraft: (key, value) => {
      drafts.current.set(key, value);
      try {
        sessionStorage.setItem(
          "threadline-session:" + key,
          JSON.stringify(value),
        );
      } catch {
        /* in-memory fallback */
      }
    },
  };
  const filtered = library.clips.filter(
    (clip) =>
      (scope === "all" ||
        (scope === "inbox" ? !clip.topicID : clip.topicID === scope)) &&
      `${clip.title} ${clip.note} ${clip.body}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function persistWidth(value: number) {
    const next = Math.max(240, Math.min(440, window.innerWidth - 400, value));
    setWidth(next);
    try {
      localStorage.setItem("threadline-sidebar-width", String(next));
    } catch {
      /* width stays for session */
    }
  }
  const historyControls = (
    <>
      <button
        className="tool history-button"
        aria-label={tr("后退", "Back")}
        title={tr("后退", "Back")}
        disabled={!pageHistory.canBack}
        onClick={pageHistory.back}
      >
        <Icon name="back" />
      </button>
      <button
        className="tool history-button"
        aria-label={tr("前进", "Forward")}
        title={tr("前进", "Forward")}
        disabled={!pageHistory.canForward}
        onClick={pageHistory.forward}
      >
        <Icon name="forward" />
      </button>
    </>
  );
  return (
    <AppContext.Provider value={context}>
      <header className="native-window-header">
        <div className="native-window-controls">
          <button
            className="tool"
            aria-label={t("切换导航栏")}
            aria-expanded={!sidebarHidden}
            onClick={() => setSidebarHidden(!sidebarHidden)}
          >
            <Icon name="sidebar" />
          </button>
          {historyControls}
        </div>
        <div className="native-context-header">
          <div id="window-page-heading" />
          <span className="native-header-spacer" />
          <nav
            className="collapsed-navigation"
            aria-label={tr(
              "收起侧栏后的导航",
              "Navigation with sidebar hidden",
            )}
          >
            <button className="tool" onClick={commands.collect}>
              {t("收录对话")}
            </button>
            <button className="tool" onClick={() => go("/thoughts")}>
              {t("我的思路")}
            </button>
            <button className="tool" onClick={commands.library}>
              {t("资料库")}
            </button>
            <button className="tool" onClick={commands.settings}>
              {t("设置")}
            </button>
          </nav>
          <AppUtilities
            openInRuntime={openInRuntime}
            history={() => setHistory(true)}
          />
        </div>
      </header>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span className="native-brand-title">Threadline</span>
            <button
              className="native-search-toggle"
              aria-label={t("搜索会话")}
              onClick={commands.search}
            >
              <Icon name="search" />
            </button>
            <button
              className="tool settings-entry"
              aria-label={t("设置")}
              onClick={commands.settings}
            >
              <Icon name="settings" />
            </button>
          </div>
          <button
            className="native-sidebar-capture"
            aria-current={collecting ? "page" : undefined}
            onClick={commands.collect}
          >
            <Icon name="chat" />
            <span>{t("收录对话")}</span>
          </button>
          <button
            className="native-thoughts-entry"
            aria-current={thoughts ? "page" : undefined}
            onClick={() => go("/thoughts")}
          >
            <Icon name="thoughts" />
            <span>{t("我的思路")}</span>
          </button>
          <select
            className="native-scope"
            aria-label={t("筛选笔记")}
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
              go(
                "/library" +
                  (event.target.value === "all"
                    ? ""
                    : "?scope=" + encodeURIComponent(event.target.value)),
              );
            }}
          >
            <option value="all">{t("全部对话")}</option>
            <option value="inbox">{t("未分类")}</option>
            {library.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
          <section className="native-list">
            <div className="native-list-head">
              <div className="searchbox">
                <Icon name="search" />
                <input
                  aria-label={t("搜索笔记")}
                  placeholder={t("搜索你的笔记")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="native-note-list">
              {filtered.map((clip) => (
                <button
                  key={clip.id}
                  className={`native-note ${selectedID === clip.id ? "selected" : ""}`}
                  onClick={() => go("/notes/" + clip.id)}
                  aria-current={selectedID === clip.id ? "true" : undefined}
                >
                  <strong className="native-note-title">{clip.title}</strong>
                  <p className="native-note-excerpt">
                    {(clip.note || clip.body)
                      .replace(/[#*`>|]/g, "")
                      .slice(0, 160)}
                  </p>
                  <span className="native-note-meta">
                    <span className="native-note-source">{clip.source}</span>
                    <span className="native-note-kind">
                      {clip.note ? t("我的判断") : t("摘录")}
                    </span>
                    <time className="native-note-date">{clip.date}</time>
                  </span>
                </button>
              ))}
              {!filtered.length ? (
                <p className="native-list-empty">
                  {query
                    ? t("没有匹配内容，换个关键词试试")
                    : t("这里还没有内容，点击「收录对话」开始")}
                </p>
              ) : null}
            </div>
          </section>
          <button
            className="tool manual-capture"
            onClick={() => setCapture({})}
          >
            ＋ {t("添加笔记")}
          </button>
        </aside>
        <main className="main">
          <div className="panel-header">
            <div className="panel-history-controls">{historyControls}</div>
            <button
              className="tool panel-wordmark"
              onClick={() =>
                void post("/api/app/open").catch((error) =>
                  notify(errorMessage(error), true),
                )
              }
            >
              Threadline
            </button>
            {!location.pathname.startsWith("/collect/") ? <AppUtilities openInRuntime={openInRuntime} history={() => setHistory(true)} /> : null}
            <nav className="panel-navigation" aria-label={t("工作区导航")}>
              <button className="tool panel-collect" onClick={commands.collect}>
                {t("对话")}
              </button>
              <button
                className="tool panel-thoughts"
                onClick={() => go("/thoughts")}
              >
                {t("我的思路")}
              </button>
              <button className="tool" onClick={commands.library}>
                {t("笔记")}
              </button>
            </nav>

            <button
              className="tool"
              aria-label={t("设置")}
              onClick={commands.settings}
            >
              <Icon name="settings" />
            </button>
          </div>
          <Outlet />
        </main>
      </div>
      <div
        className="native-resizer"
        role="separator"
        aria-label={t("调整左栏宽度")}
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={240}
        aria-valuemax={440}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button === 0) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            persistWidth(event.clientX);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            persistWidth(width + (event.key === "ArrowRight" ? 16 : -16));
          }
        }}
      />
      {notice ? (
        <div
          id="notify-message"
          className="notify-message react-notice"
          role={notice.error ? "alert" : "status"}
          data-kind={notice.error ? "error" : "info"}
        >
          <span>{notice.text}</span>
          <button aria-label={t("关闭通知")} onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      ) : null}
      <Suspense fallback={null}>
        {capture ? (
          <CaptureDialog {...capture} onClose={() => setCapture(null)} />
        ) : null}
        {topic ? (
          <TopicDialog topic={topic.value} onClose={() => setTopic(null)} />
        ) : null}
        {carrying ? <CarryDialog onClose={() => setCarrying(false)} /> : null}
        {history ? <ShareHistory onClose={() => setHistory(false)} /> : null}
      </Suspense>
      {copy !== null ? (
        <Modal title={t("内容已准备好")} onClose={() => setCopy(null)}>
          <p className="dialog-hint">
            {t("当前浏览器未允许自动复制。按 ⌘C 复制以下内容即可。")}
          </p>
          <textarea
            className="capture-input"
            aria-label={t("待复制内容")}
            readOnly
            value={copy}
            ref={(node) => {
              node?.focus();
              node?.select();
            }}
          />
        </Modal>
      ) : null}
    </AppContext.Provider>
  );
}
