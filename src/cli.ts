#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { ENV_LOGIN_PASS, ENV_LOGIN_USER } from "./config.js";
import { loginWithPassword } from "./auth/login.js";
import { clearToken, loadToken, saveToken } from "./auth/token-cache.js";

async function main() {
  const cmd = process.argv[2];
  if (cmd === "login") return doLogin();
  if (cmd === "whoami") return doWhoami();
  if (cmd === "logout") return doLogout();
  // Default: run MCP server over stdio
  await import("./index.js");
}

async function doLogin() {
  const rl = createInterface({ input: stdin, output: stdout });
  const user =
    process.env[ENV_LOGIN_USER] ?? (await rl.question("Unify email: "));
  const pass =
    process.env[ENV_LOGIN_PASS] ?? (await rl.question("Password: "));
  rl.close();
  const { accessToken, expiresIn } = await loginWithPassword(user, pass);
  await saveToken({
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    email: user,
  });
  stdout.write(`✓ Logged in as ${user}\n`);
  stdout.write(`  Token TTL: ${expiresIn}s. Auto-refresh enabled.\n`);
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
  stdout.write("✓ Logged out\n");
}

main().catch((err) => {
  stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
