import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the source directory structure: server modules resolve resources relative to web/.
export function packageRuntime(destination, { production = false } = {}) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const target = path.resolve(destination);
  if (!fs.existsSync(path.join(root, "build/client/index.html")))
    throw new Error("Run npm run build before packaging");
  fs.mkdirSync(target, { recursive: true });
  for (const name of ["web", "build/client", "plugins", ...(production ? [] : ["node_modules"])]) {
    fs.cpSync(path.join(root, name), path.join(target, name), {
      recursive: true,
      filter: (file) => !file.endsWith(".test.mjs"),
    });
  }
  fs.copyFileSync(
    path.join(root, "package.json"),
    path.join(target, "package.json"),
  );
  if (production) {
    fs.copyFileSync(path.join(root, "package-lock.json"), path.join(target, "package-lock.json"));
    execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: target, stdio: "inherit" });
    fs.rmSync(path.join(target, "package-lock.json"));
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv[2])
    throw new Error("Usage: node scripts/package-runtime.mjs <destination>");
  packageRuntime(process.argv[2]);
}
