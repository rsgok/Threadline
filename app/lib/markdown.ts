import MarkdownIt from "markdown-it";
import { t } from "./i18n.ts";
import type { Runtime } from "./types.ts";

export interface ResourceContext {
  [key: string | symbol]: unknown;
  clip?: string;
  thread?: string;
  runtime?: Runtime;
}
export function localResourceURL(path: string, context: ResourceContext = {}) {
  const params = new URLSearchParams({ path });
  if (context.clip) params.set("clip", context.clip);
  if (context.thread) {
    params.set("thread", context.thread);
    params.set("runtime", context.runtime || "codex");
  }
  return "/api/local-resource?" + params;
}
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true });
const defaultImage = markdown.renderer.rules.image!;
markdown.renderer.rules.image = (
  tokens,
  index,
  options,
  context: ResourceContext = {},
  renderer,
) => {
  const token = tokens[index],
    src = String(token.attrGet("src") || "");
  if (src.startsWith("/") && !src.startsWith("//"))
    token.attrSet("src", localResourceURL(src, context));
  token.attrSet("loading", "lazy");
  token.attrSet("class", "markdown-image-content");
  return defaultImage(tokens, index, options, context, renderer);
};
markdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  context: ResourceContext = {},
  renderer,
) => {
  const token = tokens[index],
    href = String(token.attrGet("href") || "");
  if (href.startsWith("/") && !href.startsWith("//")) {
    const url = localResourceURL(href, context);
    token.attrSet("href", url);
    token.attrSet("data-local-url", url);
    token.attrSet("class", "local-file-link");
  } else {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return renderer.renderToken(tokens, index, options);
};
export function renderMarkdown(text: string, context: ResourceContext = {}) {
  return markdown
    .render(text, context)
    .replace(
      /:codex-annotation\{index=&quot;(\d+)&quot;\}/g,
      (_, index: string) =>
        `<button type="button" class="annotation-reference" data-annotation="${index}">${t("注释")} ${index}</button>`,
    );
}
