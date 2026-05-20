/**
 * Service installer: writes a launchd plist (macOS) or systemd user unit
 * (Linux) so `unify-mcp` runs as a managed background service, then registers
 * the HTTP MCP endpoint with Claude Code.
 *
 * One command: `npx -y unify-mcp install`.
 */
import { spawnSync } from "node:child_process";
import { connect as netConnect } from "node:net";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const LABEL = "com.unify-mcp";
const DEFAULT_PORT = 53274;
const MCP_NAME = "unify";

export async function install(opts: { port?: number } = {}): Promise<void> {
  const port = opts.port ?? DEFAULT_PORT;
  if (platform() !== "darwin" && platform() !== "linux") {
    throw new Error(
      `Auto-install isn't supported on ${platform()} yet. Run \`unify-mcp\` ` +
        `manually and:\n` +
        `  claude mcp add ${MCP_NAME} --transport http http://127.0.0.1:${port}/mcp --scope user`
    );
  }

  // Make sure there's a stable global `unify-mcp` binary on disk before we
  // wire a service manager to it. If we point launchd at an npx-tempdir
  // binary, the npx cache could get cleaned and the service would break.
  const bin = await ensureGlobalInstall();
  process.stdout.write(`Using binary: ${bin}\n`);

  if (platform() === "darwin") {
    await installLaunchd(bin, port);
  } else {
    await installSystemd(bin, port);
  }

  await registerWithClaude(port);
  process.stdout.write(
    `\n✓ Done.\n` +
      `  Service:  ${LABEL} (auto-starts on login, restarts on crash)\n` +
      `  Server:   http://127.0.0.1:${port}/mcp\n` +
      `  Claude:   registered as MCP "${MCP_NAME}" (user scope)\n\n` +
      `Next: open Claude → /mcp → click Authenticate.\n`
  );
}

export async function uninstall(): Promise<void> {
  if (platform() === "darwin") await uninstallLaunchd();
  else if (platform() === "linux") await uninstallSystemd();

  const r = spawnSync("claude", ["mcp", "remove", MCP_NAME], { stdio: "pipe" });
  if (r.status === 0) {
    process.stdout.write(`✓ Removed MCP "${MCP_NAME}" from Claude.\n`);
  }
  process.stdout.write(`\n✓ Uninstalled.\n`);
}

// ── Ensure a stable, on-PATH `unify-mcp` ─────────────────────────────────

async function ensureGlobalInstall(): Promise<string> {
  const found = whichBin("unify-mcp");
  if (found) return found;

  process.stdout.write(`Installing unify-mcp globally via npm...\n`);
  const r = spawnSync("npm", ["install", "-g", "unify-mcp@latest"], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(
      `\`npm install -g unify-mcp\` failed. Install it manually and re-run.`
    );
  }
  const after = whichBin("unify-mcp");
  if (!after) {
    throw new Error(
      `npm install succeeded but \`unify-mcp\` isn't on PATH. ` +
        `Check your npm prefix (\`npm prefix -g\`) and PATH.`
    );
  }
  return after;
}

function whichBin(name: string): string | undefined {
  const r = spawnSync("which", [name], { stdio: "pipe" });
  if (r.status !== 0) return undefined;
  const out = r.stdout.toString().trim();
  return out.length > 0 ? out : undefined;
}

// ── macOS launchd ────────────────────────────────────────────────────────

function launchdPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

async function installLaunchd(bin: string, port: number): Promise<void> {
  const plistPath = launchdPlistPath();
  const logDir = join(homedir(), "Library", "Logs", "unify-mcp");
  await mkdir(logDir, { recursive: true });
  await mkdir(join(homedir(), "Library", "LaunchAgents"), { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(bin)}</string>
    <string>serve</string>
    <string>--port</string>
    <string>${port}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${escapeXml(join(logDir, "out.log"))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(join(logDir, "err.log"))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
  await writeFile(plistPath, plist, { mode: 0o644 });
  process.stdout.write(`Wrote plist: ${plistPath}\n`);

  // Reload to pick up any change.
  spawnSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  const load = spawnSync("launchctl", ["load", plistPath], { stdio: "pipe" });
  if (load.status !== 0) {
    throw new Error(
      `launchctl load failed: ${load.stderr.toString().trim() || "unknown"}`
    );
  }
  process.stdout.write(`Loaded launch agent: ${LABEL}\n`);
  await waitForPort(port, 5000);
}

async function uninstallLaunchd(): Promise<void> {
  const plistPath = launchdPlistPath();
  if (existsSync(plistPath)) {
    spawnSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
    await unlink(plistPath);
    process.stdout.write(`✓ Removed launch agent: ${LABEL}\n`);
  }
}

// ── Linux systemd ────────────────────────────────────────────────────────

function systemdUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", "unify-mcp.service");
}

async function installSystemd(bin: string, port: number): Promise<void> {
  const unitPath = systemdUnitPath();
  await mkdir(join(homedir(), ".config", "systemd", "user"), {
    recursive: true,
  });
  const unit = `[Unit]
Description=unify-mcp HTTP MCP server
After=network.target

[Service]
ExecStart=${bin} serve --port ${port}
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`;
  await writeFile(unitPath, unit, { mode: 0o644 });
  process.stdout.write(`Wrote unit: ${unitPath}\n`);

  spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  const enable = spawnSync(
    "systemctl",
    ["--user", "enable", "--now", "unify-mcp.service"],
    { stdio: "inherit" }
  );
  if (enable.status !== 0) throw new Error("systemctl --user enable failed");
  await waitForPort(port, 5000);
}

async function uninstallSystemd(): Promise<void> {
  const unitPath = systemdUnitPath();
  spawnSync("systemctl", ["--user", "disable", "--now", "unify-mcp.service"], {
    stdio: "ignore",
  });
  if (existsSync(unitPath)) {
    await unlink(unitPath);
    process.stdout.write(`✓ Removed systemd unit\n`);
  }
}

// ── Claude registration ──────────────────────────────────────────────────

async function registerWithClaude(port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/mcp`;
  if (!whichBin("claude")) {
    process.stdout.write(
      `\n⚠ \`claude\` CLI not on PATH. Service is running — register it ` +
        `manually:\n  claude mcp add ${MCP_NAME} --transport http ${url} --scope user\n`
    );
    return;
  }

  // Remove any prior registration silently (local + user scope).
  spawnSync("claude", ["mcp", "remove", MCP_NAME], { stdio: "ignore" });
  spawnSync("claude", ["mcp", "remove", MCP_NAME, "--scope", "user"], {
    stdio: "ignore",
  });

  const add = spawnSync(
    "claude",
    ["mcp", "add", MCP_NAME, "--transport", "http", url, "--scope", "user"],
    { stdio: "pipe" }
  );
  if (add.status !== 0) {
    const err = add.stderr.toString().trim();
    process.stdout.write(`\n⚠ \`claude mcp add\` reported: ${err}\n`);
  } else {
    process.stdout.write(`Registered with Claude (user scope): ${url}\n`);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      if (Date.now() > deadline) return resolve();
      const sock = netConnect({ port, host: "127.0.0.1" })
        .on("connect", () => {
          sock.end();
          resolve();
        })
        .on("error", () => {
          setTimeout(tick, 200);
        });
    };
    tick();
  });
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
    : c === "<" ? "&lt;"
    : c === ">" ? "&gt;"
    : c === '"' ? "&quot;"
    : "&apos;"
  );
}
