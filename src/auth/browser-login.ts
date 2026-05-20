import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loginPage, successPage } from "../http/pages.js";
import { interactiveLogin } from "./session.js";

export interface BrowserLoginResult {
  email: string;
  expiresIn: number;
  url: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Spin up a one-shot local HTTP server on a random loopback port, open the
 * user's default browser to a sign-in page, accept their Unify credentials,
 * exchange them for a token, then shut the server down. Returns when login
 * succeeds (or rejects on timeout / decline).
 *
 * Security: bound to 127.0.0.1, single-use CSRF token in URL path, port is
 * random per invocation, server self-destructs after the first successful POST.
 */
export function browserLogin(opts?: {
  timeoutMs?: number;
  onUrlReady?: (url: string) => void;
}): Promise<BrowserLoginResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const csrf = randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const isLogin = url.pathname === `/login/${csrf}`;

      if (!isLogin) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(loginPage({ formAction: `/login/${csrf}` }));
        return;
      }

      if (req.method === "POST") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 8192) {
            req.destroy();
          }
        });
        req.on("end", async () => {
          const params = new URLSearchParams(body);
          const email = params.get("email")?.trim();
          const password = params.get("password");
          if (!email || !password) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              loginPage({
                formAction: `/login/${csrf}`,
                error: "Email and password are both required.",
              })
            );
            return;
          }
          try {
            const { expiresIn } = await interactiveLogin(email, password);
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(successPage({ email, autoClose: true }));
            // Give the browser ~500ms to fetch the success page before closing.
            setTimeout(() => {
              server.close();
              settle(() =>
                resolve({ email, expiresIn, url: serverUrl ?? "" })
              );
            }, 500);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(loginPage({ formAction: `/login/${csrf}`, error: msg }));
          }
        });
        return;
      }

      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method not allowed");
    });

    let serverUrl: string | undefined;
    server.on("error", (err) => {
      settle(() => reject(err));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr) {
        settle(() => reject(new Error("Failed to bind local login server")));
        return;
      }
      serverUrl = `http://127.0.0.1:${addr.port}/login/${csrf}`;
      opts?.onUrlReady?.(serverUrl);
      openBrowser(serverUrl);
    });

    const timer = setTimeout(() => {
      server.close();
      settle(() =>
        reject(new Error(`Browser sign-in timed out after ${Math.round(timeoutMs / 1000)}s`))
      );
    }, timeoutMs);
    timer.unref();
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open"
    : platform === "win32" ? "cmd"
    : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {
      // Best-effort: URL also surfaces via onUrlReady so caller can show it.
    });
    child.unref();
  } catch {
    // Headless / no browser — caller already received the URL.
  }
}

