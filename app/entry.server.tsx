import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";

// SPA mode invokes this only to build the initial shell. No framework server ships.
export default async function renderShell(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  const stream = await renderToReadableStream(
    <ServerRouter context={context} url={request.url} />,
  );
  await stream.allReady;
  return new Response(stream, { status, headers });
}
