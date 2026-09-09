// Preserve surface flags across routes, but never copy old selection/query state implicitly.
export function surfacePath(path: string, search: string): string {
  const flags = new URLSearchParams(search);
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  for (const flag of ["native", "panel"])
    if (flags.get(flag) === "1") params.set(flag, "1");
  const suffix = params.toString();
  return pathname + (suffix ? "?" + suffix : "");
}
export function entryPath(url: URL): string {
  const params = url.searchParams;
  const note = params.get("note"),
    topic = params.get("topic"),
    thread = params.get("thread");
  const workspace = params.get("workspace");
  if (note && workspace === "note")
    return surfacePath("/notes/" + encodeURIComponent(note), url.search);
  if (topic && workspace === "topic")
    return surfacePath("/thoughts/" + encodeURIComponent(topic), url.search);
  if (workspace === "inbox" || workspace === "all")
    return surfacePath(
      "/library" + (workspace === "inbox" ? "?scope=inbox" : ""),
      url.search,
    );
  if (workspace === "home") return surfacePath("/thoughts", url.search);
  if (thread)
    return surfacePath(
      "/collect/" +
        (params.get("runtime") === "cursor" ? "cursor" : "codex") +
        "/" +
        encodeURIComponent(thread),
      url.search,
    );
  return surfacePath(
    params.get("native") === "1" ||
      params.get("panel") === "1" ||
      params.get("view") === "import"
      ? "/collect"
      : "/thoughts",
    url.search,
  );
}
