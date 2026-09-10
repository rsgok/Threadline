import { WindowHeading } from "../components/window-heading";
import { useApp } from "../lib/app-context";
import { t, tr } from "../lib/i18n";

export default function Thoughts() {
  const app = useApp();
  return (
    <section className="workspace topic-manager route-scroll">
      <div className="thought-heading">
        <WindowHeading><h1>{t("我的思路")}</h1></WindowHeading>
        <button className="primary" onClick={() => app.editTopic()}>
          {t("＋ 新建思路")}
        </button>
      </div>
      <p className="workspace-description">
        {t(
          "思路就是对话的分类。围绕一个问题组织对话；未指定思路的内容归入「未分类」。",
        )}
      </p>
      <div className="topic-management-list">
        {app.library.topics.map((topic) => (
          <article className="topic-management-row" key={topic.id}>
            <div>
              <button
                className="note-open"
                onClick={() => app.go("/thoughts/" + topic.id)}
              >
                {topic.title}
              </button>
              <p>{topic.goal || t("还没有描述")}</p>
              <small>
                {tr(
                  `${app.library.clips.filter((clip) => clip.topicID === topic.id).length} 篇对话`,
                  `${app.library.clips.filter((clip) => clip.topicID === topic.id).length} conversations`,
                )}
              </small>
            </div>
            <button className="tool" onClick={() => app.editTopic(topic)}>
              {t("编辑")}
            </button>
            <button
              className="tool"
              onClick={() => app.go("/thoughts/" + topic.id)}
            >
              {t("查看对话 →")}
            </button>
          </article>
        ))}
      </div>
      {!app.library.topics.length ? (
        <p className="workspace-empty">
          {t("还没有思路。从一个想持续探索的问题开始。")}
        </p>
      ) : null}
      <div className="hero-actions">
        <button className="secondary" onClick={() => app.go("/collect")}>
          {t("收录对话")}
        </button>
        <button className="tool" onClick={() => app.go("/library?scope=inbox")}>
          {t("未分类")}
        </button>
        <button className="tool" onClick={() => app.openCarry()}>
          {t("使用对话")}
        </button>
      </div>
    </section>
  );
}
