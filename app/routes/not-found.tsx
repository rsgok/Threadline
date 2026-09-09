import { useApp } from "../lib/app-context";
import { tr } from "../lib/i18n";

export default function NotFound() {
  const { go } = useApp();
  return (
    <section className="workspace">
      <h1>{tr("页面不存在", "Page not found")}</h1>
      <button className="secondary" onClick={() => go("/library")}>
        {tr("返回资料库", "Back to library")}
      </button>
    </section>
  );
}
