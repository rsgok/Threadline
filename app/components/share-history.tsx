import { useEffect, useState } from "react";
import { api, post } from "../lib/api";
import { t, tr } from "../lib/i18n";
import type { ShareJob } from "../lib/types";
import { Modal } from "./modal";
import { ErrorText, Loading } from "./common";
import "../../web/sharing.css";

export function ShareHistory({
  onClose,
  initialID,
}: {
  onClose(): void;
  initialID?: string;
}) {
  const [id, setID] = useState(initialID || ""),
    [record, setRecord] = useState<ShareJob | null>(null),
    [jobs, setJobs] = useState<ShareJob[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setRecord(null);
    setJobs(null);
    void (
      id
        ? api<ShareJob>("/api/share/jobs/" + id, {
            signal: controller.signal,
          }).then(setRecord)
        : api<{ jobs: ShareJob[] }>("/api/share/history", {
            signal: controller.signal,
          }).then((result) => setJobs(result.jobs))
    ).catch((error) => {
      if (!controller.signal.aborted) setError(error);
    });
    return () => controller.abort();
  }, [id, revision]);
  async function run(action: string, data = {}) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/share/jobs/" + id + "/" + action, data);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error);
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  const labels = {
    sent: t("已送达"),
    pending: t("待发送"),
    sending: t("发送中"),
    failed: t("失败"),
    uncertain: t("送达状态未知"),
  };
  return (
    <Modal
      title={t("分享记录")}
      className="share-history-dialog"
      onClose={onClose}
      busy={busy}
    >
      {!record && !jobs && !error ? <Loading /> : null}
      <ErrorText error={error} />
      {jobs ? (
        <>
          {!jobs.length ? (
            <p>{t("还没有 Slack 或 Discord 分享记录。")}</p>
          ) : (
            jobs.map((job) => (
              <button
                className="tool share-history-row"
                key={job.id}
                onClick={() => setID(job.id)}
              >
                {job.title} · {job.platform} ·{" "}
                {job.steps.filter((step) => step.status === "sent").length}/
                {job.steps.length}
              </button>
            ))
          )}
        </>
      ) : null}
      {record ? (
        <>
          <h3>{record.title}</h3>
          <p>
            {record.platform} → {record.target}
          </p>
          <pre className="share-preview carry-preview">{record.text}</pre>
          <p>
            {tr(
              `已完成 ${record.steps.filter((step) => step.status === "sent").length}/${record.steps.length} 部分`,
              `Completed ${record.steps.filter((step) => step.status === "sent").length}/${record.steps.length} parts`,
            )}
          </p>
          {record.steps.map((step) => (
            <div className="share-step" key={step.id}>
              <span>
                {step.label} · {labels[step.status]}
              </span>
              <ErrorText error={step.error} />
              {step.status === "uncertain" ? (
                <>
                  <p>{t("请在目标应用核对这一部分，再选择：")}</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run("resolve", { stepId: step.id, delivered: true })
                    }
                  >
                    {t("确认已送达")}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run("resolve", { stepId: step.id, delivered: false })
                    }
                  >
                    {t("确认未送达")}
                  </button>
                </>
              ) : null}
            </div>
          ))}
          {!record.expired &&
          !record.sending &&
          record.steps.some((step) => step.status !== "sent") &&
          !record.steps.some((step) => step.status === "uncertain") ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run("send")}
            >
              {t("继续发送未完成部分")}
            </button>
          ) : null}
          {record.expired ? (
            <p>{t("预览已过期。发送记录保留，请重新选择内容。")}</p>
          ) : null}
          {record.sending ? (
            <button
              className="tool"
              disabled={busy}
              onClick={() => setRevision((value) => value + 1)}
            >
              {t("刷新发送进度")}
            </button>
          ) : null}
          <button className="tool" disabled={busy} onClick={() => setID("")}>
            {t("返回记录列表")}
          </button>
        </>
      ) : null}
    </Modal>
  );
}
