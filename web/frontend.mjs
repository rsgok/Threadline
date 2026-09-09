import fs from "node:fs";
import path from "node:path";

// Only compiled assets and application routes are served here. API misses remain 404s.
export function serveFrontend(req, res, url, directory) {
  if (!["GET", "HEAD"].includes(req.method)) return false;
  const route =
    /^\/(?:library|settings|thoughts(?:\/[^/.]+)?|notes\/[^/.]+|collect(?:\/[^/.]+){0,2})?\/?$/.test(
      url.pathname,
    );
  const asset =
    url.pathname.startsWith("/assets/") && /\.(?:js|css)$/.test(url.pathname);
  if (!route && !asset) return false;
  const root = path.resolve(directory);
  let requested;
  try {
    requested = asset ? decodeURIComponent(url.pathname) : "/index.html";
  } catch {
    return false;
  }
  const filename = path.resolve(root, "." + requested);
  if (!filename.startsWith(root + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (asset) return false;
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      req.method === "HEAD"
        ? undefined
        : "Threadline frontend is not built. Run npm run build, then restart the service.",
    );
    return true;
  }
  if (
    !stat.isFile() ||
    !fs.realpathSync(filename).startsWith(fs.realpathSync(root) + path.sep)
  )
    return false;
  const type = route
    ? "text/html"
    : filename.endsWith(".css")
      ? "text/css"
      : "text/javascript";
  res.setHeader("Content-Type", type + "; charset=utf-8");
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Cache-Control",
    asset && /-[\w-]{8,}\.(js|css)$/.test(filename)
      ? "public, max-age=31536000, immutable"
      : "no-store",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (route)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
    );
  res.statusCode = 200;
  if (req.method === "HEAD") res.end();
  else
    fs.createReadStream(filename)
      .on("error", (error) => res.destroy(error))
      .pipe(res);
  return true;
}
