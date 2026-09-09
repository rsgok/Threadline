import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Every browser test gets fictional data. Never discover the user's actual sessions.
const runtime = process.env.THREADLINE_TEST_RUNTIME_ROOT;
const base = runtime
  ? pathToFileURL(path.resolve(runtime, "web") + path.sep).href
  : new URL("../web/", import.meta.url).href;
const { createRewindServer } = await import(new URL("server.mjs", base));
const { LibraryStore } = await import(new URL("storage.mjs", base));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadline-ui-"));
const codexHome = path.join(directory, "codex"),
  cursorHome = path.join(directory, "cursor");
fs.mkdirSync(path.join(codexHome, "sessions"), { recursive: true });
fs.mkdirSync(cursorHome);
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=";
const imagePath = path.join(directory, "sample.png");
fs.writeFileSync(imagePath, Buffer.from(png, "base64"));
for (let index = 1; index <= 8; index++) {
  const id = `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
  const title = index === 1 ? "界面架构讨论" : `设计讨论 ${index}`;
  const text =
    index === 1
      ? '# 设计方案\n\n采用共享组件，让界面保持一致。\n\n```ts\nconst greeting = "<script>alert(1)</script>";\n```\n\n| 方案 | 说明 |\n| --- | --- |\n| React | 组件复用 |\n\n' +
        "保留原文，整理判断，并在下一次讨论中继续使用。\n\n".repeat(35) +
        `![示例图片](${imagePath})`
      : "保留讨论中的判断，以后继续探索。";
  const rows = [
    { type: "session_meta", payload: { id, cwd: directory } },
    {
      type: "response_item",
      timestamp: "2026-09-10T04:00:00Z",
      payload: {
        type: "message",
        id: "q1",
        role: "user",
        content: [{ type: "input_text", text: "我们应该怎样组织界面和数据？" }],
      },
    },
    {
      type: "response_item",
      timestamp: "2026-09-10T04:00:01Z",
      payload: {
        type: "message",
        id: "p1",
        role: "assistant",
        phase: "commentary",
        content: [{ type: "output_text", text: "正在核对接口和组件边界" }],
      },
    },
    {
      type: "response_item",
      timestamp: "2026-09-10T04:00:02Z",
      payload: {
        type: "message",
        id: "a1",
        role: "assistant",
        phase: "final_answer",
        content: [{ type: "output_text", text }],
      },
    },
    { type: "event_msg", payload: { type: "task_complete" } },
  ];
  fs.writeFileSync(
    path.join(codexHome, "sessions", `rollout-${id}.jsonl`),
    rows.map(JSON.stringify).join("\n"),
  );
  fs.appendFileSync(
    path.join(codexHome, "session_index.jsonl"),
    JSON.stringify({
      id,
      thread_name: title,
      updated_at: `2026-09-10T04:00:0${index}Z`,
    }) + "\n",
  );
}
const store = new LibraryStore(directory, null);
const topicID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
store.putTopic({
  id: topicID,
  title: "产品方向",
  goal: "让值得保留的判断可以继续使用",
  createdAt: 810000000,
  updatedAt: 810000000,
});
for (let index = 1; index <= 2; index++)
  store.put({
    id: `BBBBBBBB-BBBB-4BBB-8BBB-${String(index).padStart(12, "0")}`,
    title: `已有判断 ${index}`,
    body:
      index === 1
        ? "用户需要快速找回原来的判断。\n\n保留原文，才能核对依据。"
        : "统一组件可以减少重复工作。\n\n保留原文，才能核对依据。",
    note: "",
    question: "",
    sourceURL: "",
    topicID,
    source: "Codex",
    createdAt: 810000000 + index,
    updatedAt: 810000000 + index,
  });
store.close();
const server = createRewindServer({
  dataDir: directory,
  legacyDir: null,
  codexHome,
  cursorHome,
  ocr: false,
  feishu: {
    status: async () => ({
      connected: false,
      ready: false,
      privateReady: false,
    }),
  },
});
const port = Number(process.env.THREADLINE_TEST_PORT || 43149);
server.listen(port, "127.0.0.1", () =>
  console.log(`Fictional UI fixture: http://127.0.0.1:${port}`),
);
function stop() {
  server.close(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
