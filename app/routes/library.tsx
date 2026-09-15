import { Navigate, useLocation, useSearchParams } from "react-router";
import { useApp } from "../lib/app-context";
import { surfacePath } from "../lib/navigation";
import { tr } from "../lib/i18n";

// Compatibility for saved links and native commands; notes live in the sidebar.
export default function Library() {
  const app = useApp();
  const location = useLocation();
  const [params] = useSearchParams();
  const scope = params.get("scope") || "all";
  const note = app.library.clips.find(clip => scope === "all" ||
    (scope === "inbox" ? !clip.topicID : clip.topicID === scope));
  if (note) return <Navigate replace to={surfacePath("/notes/" + note.id, location.search)} />;
  return <section className="workspace workspace-empty">
    <p>{tr("这里还没有笔记", "No notes here yet")}</p>
    <button className="primary" onClick={() => app.capture(scope === "all" || scope === "inbox" ? "" : scope)}>
      {tr("添加笔记", "Add note")}
    </button>
  </section>;
}
