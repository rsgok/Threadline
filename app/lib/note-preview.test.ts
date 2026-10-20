import { test } from "node:test";
import assert from "node:assert/strict";
import { notePreview } from "./note-preview.ts";

test("a collected conversation previews its own words, not its headings", () => {
  const body = [
    "### 我的问题 · 2026-09-10T04:00:00 UTC",
    "",
    "我们应该怎样组织界面和数据？",
    "",
    "---",
    "",
    "### AI 回答 · 2026-09-10T04:00:01 UTC",
    "",
    "采用共享组件，让界面保持一致。",
  ].join("\n");
  const preview = notePreview(body);
  assert.equal(preview, "我们应该怎样组织界面和数据？ 采用共享组件，让界面保持一致。");
  assert.ok(!preview.includes("我的问题"), "role headings must not leak into the preview");
  assert.ok(!preview.includes("AI 回答"), "role headings must not leak into the preview");
  assert.ok(!preview.includes("2026-09-10"), "timestamps must not leak into the preview");
  assert.ok(!preview.includes("---"), "separators must not leak into the preview");
});

test("a plain note keeps its own text", () => {
  assert.equal(notePreview("保留原文，才能核对依据。"), "保留原文，才能核对依据。");
  assert.equal(notePreview(""), "");
});

test("markdown decoration is removed without changing the words", () => {
  assert.equal(notePreview("**加粗**与`代码`"), "加粗与代码");
  assert.equal(notePreview("# 标题\n\n正文"), "标题 正文");
  assert.equal(notePreview("- 第一项\n- 第二项"), "第一项 第二项");
  assert.equal(notePreview("> 引用内容"), "引用内容");
  assert.equal(notePreview("![说明](<本地路径.png>)"), "说明");
  assert.equal(notePreview("```ts\nlet x = 1\n```"), "let x = 1");
});

test("a long note is shortened with an ellipsis", () => {
  const long = "字".repeat(400);
  const preview = notePreview(long, 20);
  assert.equal(preview, "字".repeat(20) + "…");
});

test("a personal judgment takes priority over the source body", () => {
  const body = "### AI 回答\n\n原文内容";
  assert.equal(notePreview("我的判断", 160), "我的判断");
  assert.ok(notePreview(body).includes("原文内容"));
});

test("a code placeholder replaces the code block when one is given", () => {
  const body = "说明文字\n\n```ts\nlet x = 1\n```\n\n更多内容";
  assert.equal(notePreview(body, 160, "〔代码〕"), "说明文字 〔代码〕 更多内容");
  assert.equal(notePreview(body), "说明文字 let x = 1 更多内容");
});

test("a table keeps its cell text", () => {
  const table = [
    "| 方案 | 说明 |",
    "| --- | --- |",
    "| React | 组件复用 |",
    "| Vue | 渐进式 |",
  ].join("\n");
  const preview = notePreview(table);
  assert.ok(preview.includes("React"), "table rows must keep their content");
  assert.ok(preview.includes("组件复用"), "table rows must keep their content");
  assert.ok(!preview.includes("---"), "the alignment row must be dropped");
});

test("a table inside a note does not hide the rest of it", () => {
  const body = ["| 方案 | 说明 |", "| --- | --- |", "| React | 组件复用 |", "", "结尾说明"].join("\n");
  const preview = notePreview(body);
  assert.ok(preview.includes("组件复用"));
  assert.ok(preview.includes("结尾说明"));
});

test("a role heading inside a code example is kept", () => {
  // The conversation format is often shown as an example. Such an example is
  // content, so its role headings must survive.
  const body = [
    "说明文字",
    "",
    "```md",
    "### AI 回答",
    "这是示例",
    "```",
    "",
    "结尾",
  ].join("\n");
  const preview = notePreview(body);
  assert.ok(preview.includes("AI 回答"), "a heading inside a fence is part of the example");
  assert.ok(preview.includes("这是示例"));
  assert.ok(preview.includes("说明文字"));
  assert.ok(preview.includes("结尾"));
});

test("a role heading outside a code example is still removed", () => {
  const body = [
    "### 我的问题 · 2026-09-10T04:00:00 UTC",
    "",
    "问题正文",
    "",
    "```md",
    "### AI 回答",
    "```",
  ].join("\n");
  const preview = notePreview(body);
  assert.ok(!preview.includes("我的问题"), "a real role heading must be removed");
  assert.ok(preview.includes("AI 回答"), "the example heading must be kept");
});

test("an unterminated fence does not swallow the rest of the note", () => {
  const body = "开头\n\n```ts\nlet x = 1";
  const preview = notePreview(body);
  assert.ok(preview.includes("开头"));
  assert.ok(preview.includes("let x = 1"));
});
