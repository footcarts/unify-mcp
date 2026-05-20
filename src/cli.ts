#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { ENV_LOGIN_PASS, ENV_LOGIN_USER } from "./config.js";
import { clearCredentials } from "./auth/credentials.js";
import { interactiveLogin } from "./auth/session.js";
import { clearToken, loadToken } from "./auth/token-cache.js";

async function main() {
  const cmd = process.argv[2];
  if (cmd === "install") return doInstall();
  if (cmd === "uninstall") return doUninstall();
  if (cmd === "login") return doLogin();
  if (cmd === "whoami") return doWhoami();
  if (cmd === "logout") return doLogout();
  if (cmd === "--help" || cmd === "-h" || cmd === "help") return printHelp();
  if (cmd === "serve" || cmd === undefined) return doServe();
  stderr.write(`Unknown command: ${cmd}\n`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  stdout.write(`unify-mcp — MCP server for Unify GTM

One-command install:
  npx -y unify-mcp install      Install as a launchd/systemd service +
                                register with Claude Code (recommended)

Other commands:
  unify-mcp                     Run the HTTP MCP server in the foreground
  unify-mcp serve [--port N]    Same as above; override the port
  unify-mcp uninstall           Stop the service + unregister from Claude
  unify-mcp login               Sign in via terminal (skip the browser)
  unify-mcp whoami              Show cached token email + remaining TTL
  unify-mcp logout              Clear cached token + saved credentials

After install, open Claude → /mcp → click Authenticate. Token lasts ~30 days.
`);
}

async function doInstall() {
  const port = readPortArg();
  const { install } = await import("./installer.js");
  await install(port ? { port } : {});
}

async function doUninstall() {
  const { uninstall } = await import("./installer.js");
  await uninstall();
}

async function doServe() {
  const port = readPortArg();
  const { startHttpServer } = await import("./http/server.js");
  await startHttpServer(port ? { port } : {});
}

function readPortArg(): number | undefined {
  const idx = process.argv.indexOf("--port");
  if (idx >= 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  if (process.env.UNIFY_MCP_PORT) return Number(process.env.UNIFY_MCP_PORT);
  return undefined;
}

async function doLogin() {
  const rl = createInterface({ input: stdin, output: stdout });
  const user =
    process.env[ENV_LOGIN_USER] ?? (await rl.question("Unify email: "));
  const pass =
    process.env[ENV_LOGIN_PASS] ?? (await rl.question("Password: "));
  rl.close();
  const { expiresIn } = await interactiveLogin(user, pass);
  stdout.write(`✓ Logged in as ${user}\n`);
  stdout.write(
    `  Token TTL: ${expiresIn}s. Credentials cached for silent re-auth.\n`
  );
}

async function doWhoami() {
  const t = await loadToken();
  if (!t) {
    stdout.write("Not logged in. Run: unify-mcp login\n");
    process.exit(1);
  }
  const remainingMs = t.expiresAt - Date.now();
  stdout.write(`${t.email}\n`);
  stdout.write(
    `Token ${remainingMs > 0 ? `valid for ${Math.round(remainingMs / 1000)}s` : "EXPIRED"}\n`
  );
}

async function doLogout() {
  await clearToken();
  await clearCredentials();
  stdout.write("✓ Logged out (token + credentials cleared)\n");
}

main().catch((err) => {
  stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
