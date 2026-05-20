#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { ENV_LOGIN_PASS, ENV_LOGIN_USER } from "./config.js";
import { clearCredentials } from "./auth/credentials.js";
import { interactiveLogin } from "./auth/session.js";
import { clearToken, loadToken } from "./auth/token-cache.js";

async function main() {
  const cmd = process.argv[2];
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

Usage:
  unify-mcp                    Run the HTTP MCP server (default port 53274)
  unify-mcp serve [--port N]   Same as above; override the port
  unify-mcp login              Sign in via terminal (email + password)
  unify-mcp whoami             Show the cached token + remaining TTL
  unify-mcp logout             Clear the cached token + saved credentials

Register with Claude Code:
  claude mcp add --transport http unify http://127.0.0.1:53274/mcp

First request opens a browser sign-in page. The cached token lasts ~30 days.
`);
}

async function doServe() {
  const portIdx = process.argv.indexOf("--port");
  const port =
    portIdx >= 0 && process.argv[portIdx + 1]
      ? Number(process.argv[portIdx + 1])
      : process.env.UNIFY_MCP_PORT
        ? Number(process.env.UNIFY_MCP_PORT)
        : undefined;
  const { startHttpServer } = await import("./http/server.js");
  await startHttpServer({ port });
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
