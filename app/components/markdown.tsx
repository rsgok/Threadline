import { memo, useMemo, useState } from "react";
import { renderMarkdown, type ResourceContext } from "../lib/markdown";
import { post, errorMessage } from "../lib/api";
import { useApp } from "../lib/app-context";
import { t } from "../lib/i18n";

export const Markdown = memo(function Markdown({
  text,
  clip,
  thread,
  runtime,
  annotations,
}: {
  text: string;
  annotations?: { text: string; comment: string }[];
} & ResourceContext) {
  const { notify } = useApp();
  const [annotation, setAnnotation] = useState<number | null>(null);
  const html = useMemo(
    () => renderMarkdown(text, { clip, thread, runtime }),
    [text, clip, thread, runtime],
  );
  return (
    <>
      <div
        className="article message-markdown"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(event) => {
          const link = (event.target as Element).closest<HTMLElement>(
            "[data-local-url]",
          );
          if (link) {
            event.preventDefault();
            void post(link.dataset.localUrl!)
              .then(() => notify(t("已在 Finder 中显示")))
              .catch((error) => notify(errorMessage(error), true));
          }
          const reference = (event.target as Element).closest<HTMLElement>(
            "[data-annotation]",
          );
          if (reference) {
            const index = Number(reference.dataset.annotation) - 1;
            setAnnotation((previous) => (previous === index ? null : index));
          }
        }}
        onError={(event) => {
          const image = event.target;
          if (image instanceof HTMLImageElement) {
            image.alt = t("图片暂不可预览");
            image.classList.add("image-unavailable");
          }
        }}
      />
      {annotation !== null ? (
        <aside className="annotation-popover" role="note">
          {annotations?.[annotation] ? (
            <>
              <blockquote>{annotations[annotation].text}</blockquote>
              <p>{annotations[annotation].comment}</p>
            </>
          ) : (
            t("原注释暂不可用")
          )}
          <button className="tool" onClick={() => setAnnotation(null)}>
            {t("关闭")}
          </button>
        </aside>
      ) : null}
    </>
  );
});
