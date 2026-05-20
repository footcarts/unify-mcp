/**
 * Self-updater. Called at `serve` startup. If a newer version of unify-mcp is
 * on npm, runs `npm install -g unify-mcp@latest` and exits the process so the
 * service manager (launchd / systemd) restarts on the new version.
 *
 * Throttled to once every 6 hours via a timestamp file so rapid crash-loops
 * don't hammer the npm registry.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { request as httpsRequest } from "node:https";
import { TOKEN_CACHE_DIR } from "./config.js";

const REGISTRY_URL = "https://registry.npmjs.org/unify-mcp/latest";
const THROTTLE_MS = 6 * 60 * 60 * 1000;
const STAMP_FILE = "last-update-check";

interface PackageJson {
  version: string;
}

let pkgVersion: string | undefined;
async function readSelfVersion(): Promise<string | undefined> {
  if (pkgVersion) return pkgVersion;
  try {
    // dist/updater.js → ../package.json (dist sibling to package.json)
    const pkgPath = join(
      dirname(new URL(import.meta.url).pathname),
      "..",
      "package.json"
    );
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as PackageJson;
    pkgVersion = pkg.version;
    return pkgVersion;
  } catch {
    return undefined;
  }
}

function stampPath(): string {
  return join(homedir(), TOKEN_CACHE_DIR, STAMP_FILE);
}

async function recentlyChecked(): Promise<boolean> {
  try {
    const raw = await readFile(stampPath(), "utf8");
    const ts = Number(raw.trim());
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < THROTTLE_MS;
  } catch {
    return false;
  }
}

async function recordCheck(): Promise<void> {
  try {
    await mkdir(join(homedir(), TOKEN_CACHE_DIR), { recursive: true, mode: 0o700 });
    await writeFile(stampPath(), String(Date.now()), { mode: 0o600 });
  } catch {
    // best-effort
  }
}

function fetchLatestVersion(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const req = httpsRequest(
      REGISTRY_URL,
      { method: "GET", headers: { accept: "application/vnd.npm.install-v1+json" } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(undefined);
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(body) as { version?: string };
            resolve(typeof j.version === "string" ? j.version : undefined);
          } catch {
            resolve(undefined);
          }
        });
      }
    );
    req.on("error", () => resolve(undefined));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(undefined);
    });
    req.end();
  });
}

function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((x) => Number(x));
  const b = current.split(".").map((x) => Number(x));
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

function npmBinPath(): string {
  // Same directory as the running node binary (works for nvm, brew, system).
  return join(dirname(process.execPath), process.platform === "win32" ? "npm.cmd" : "npm");
}

/**
 * Run npm install -g unify-mcp@latest in the background. Resolves true if
 * install reported success, false otherwise. Output goes to stderr so it ends
 * up in the service log.
 */
function installLatest(): Promise<boolean> {
  return new Promise((resolve) => {
    const npm = npmBinPath();
    const child = spawn(npm, ["install", "-g", "unify-mcp@latest"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * Fire-and-forget. Caller does not await. If a newer version is found and
 * successfully installed, exits the process so the service manager restarts
 * on the new binary.
 */
export function maybeSelfUpdate(): void {
  if (process.env.UNIFY_MCP_DISABLE_AUTOUPDATE === "1") return;

  void (async () => {
    try {
      if (await recentlyChecked()) return;
      const [current, latest] = await Promise.all([
        readSelfVersion(),
        fetchLatestVersion(),
      ]);
      await recordCheck();
      if (!current || !latest) return;
      if (!isNewer(latest, current)) return;

      process.stderr.write(
        `[unify-mcp] update available: ${current} → ${latest}. Installing...\n`
      );
      const ok = await installLatest();
      if (!ok) {
        process.stderr.write(
          `[unify-mcp] auto-update failed (npm install -g exited non-zero). ` +
            `Will retry after ${Math.round(THROTTLE_MS / 3600000)}h.\n`
        );
        return;
      }
      process.stderr.write(
        `[unify-mcp] installed ${latest}. Exiting so service manager restarts on the new version.\n`
      );
      // Tiny delay so the log line lands before exit.
      setTimeout(() => process.exit(0), 100);
    } catch (err) {
      process.stderr.write(
        `[unify-mcp] auto-update check errored: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      );
    }
  })();
}
