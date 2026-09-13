import { SessionList } from "../components/session-list";
import type { Route } from "./+types/collect";
import { api } from "../lib/api";
import type { RecentSession, Runtime, Session } from "../lib/types";

import { SessionView } from "../components/session-view";
export async function clientLoader({
  request,
  params,
}: Route.ClientLoaderArgs) {
  if (params.runtime && !["codex", "cursor"].includes(params.runtime))
    throw new Response("Unknown runtime", { status: 404 });
  if (!params.threadID)
    return {
      kind: "list" as const,
      ...(await api<{
        sessions: RecentSession[];
        errors?: { runtime: string; message: string }[];
      }>("/api/sessions/recent", { signal: request.signal })),
    };
  const runtime = params.runtime as Runtime;
  let progress = false;
  try {
    progress =
      JSON.parse(
        sessionStorage.getItem(
          "threadline-session:" + runtime + ":" + params.threadID,
        ) || "{}",
      ).includeProgress === true;
  } catch {
    /* default */
  }
  const { session } = await api<{ session: Session }>(
    `/api/${runtime}/sessions/${encodeURIComponent(params.threadID)}${progress ? "?progress=1" : ""}`,
    { signal: request.signal },
  );
  return { kind: "session" as const, session, runtime };
}
export default function Collect({ loaderData }: Route.ComponentProps) {
  return loaderData.kind === "list" ? (
    <SessionList data={loaderData} />
  ) : (
    <SessionView
      key={loaderData.runtime + loaderData.session.id}
      initial={loaderData.session}
      runtime={loaderData.runtime}
    />
  );
}
