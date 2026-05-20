import { randomBytes } from "node:crypto";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { z } from "zod";
import { interactiveLogin } from "../auth/session.js";
import { findTool, tools } from "../tools/index.js";
import {
  CODE_TTL,
  UnifyOAuthProvider,
  popPending,
  stashPending,
} from "./oauth-provider.js";
import { loginPage, successPage } from "./pages.js";
import { saveAuthCode } from "./storage.js";

export interface ServeOptions {
  port?: number;
  host?: string;
}

const DEFAULT_PORT = 53274;

/**
 * Build the express app: OAuth endpoints (via SDK router) + login form +
 * bearer-gated MCP endpoint. Single-user, single-process — designed to run on
 * the user's localhost.
 */
export async function startHttpServer(opts: ServeOptions = {}): Promise<void> {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? "127.0.0.1";
  const issuerUrl = new URL(`http://${host}:${port}`);

  const provider = new UnifyOAuthProvider();
  const app = express();

  // OAuth endpoints: /.well-known/oauth-authorization-server,
  // /.well-known/oauth-protected-resource, /authorize, /token, /register,
  // /revoke. Provided by the SDK based on our provider implementation.
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      scopesSupported: [],
      resourceName: "Unify MCP",
    })
  );

  // Login form pages — the actual user-facing UI the OAuth /authorize handler
  // redirects to. POST submits Unify credentials, we exchange with Auth0
  // server-side, mint an auth code, redirect back to the OAuth client.
  app.get("/login/:sessionId", (req, res) => {
    const session = popPending(req.params.sessionId);
    if (!session) {
      res.status(400).type("text/plain").send(
        "This sign-in link has expired or was already used. Return to Claude and trigger the sign-in again."
      );
      return;
    }
    // Re-stash so POST can find it. Hand back a fresh id so the link is
    // one-shot per browser navigation.
    const newId = stashPending(session);
    res
      .status(200)
      .type("text/html")
      .send(loginPage({ formAction: `/login/${newId}/submit` }));
  });

  app.post(
    "/login/:sessionId/submit",
    express.urlencoded({ extended: false, limit: "8kb" }),
    async (req, res) => {
      const session = popPending(req.params.sessionId);
      if (!session) {
        res.status(400).type("text/plain").send(
          "This sign-in session expired. Return to Claude and retry."
        );
        return;
      }

      const email = String(req.body.email ?? "").trim();
      const password = String(req.body.password ?? "");
      if (!email || !password) {
        const replayId = stashPending(session);
        res
          .status(400)
          .type("text/html")
          .send(
            loginPage({
              formAction: `/login/${replayId}/submit`,
              error: "Email and password are both required.",
            })
          );
        return;
      }

      try {
        await interactiveLogin(email, password);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const replayId = stashPending(session);
        res
          .status(401)
          .type("text/html")
          .send(
            loginPage({
              formAction: `/login/${replayId}/submit`,
              error: msg,
            })
          );
        return;
      }

      // Login succeeded; the underlying Unify token cache is now populated.
      // Mint an OAuth authorization code and redirect back to the client.
      const code = randomBytes(24).toString("base64url");
      await saveAuthCode({
        code,
        clientId: session.client.client_id,
        redirectUri: session.params.redirectUri,
        codeChallenge: session.params.codeChallenge,
        email,
        expiresAt: Date.now() + CODE_TTL,
      });

      const callback = new URL(session.params.redirectUri);
      callback.searchParams.set("code", code);
      if (session.params.state) {
        callback.searchParams.set("state", session.params.state);
      }
      // Show the success page briefly, then redirect to the OAuth client's
      // callback. The client (Claude Code) typically responds with an
      // auto-close page. Our success page also tries window.close() as a
      // belt-and-suspenders fallback.
      res
        .status(200)
        .type("text/html")
        .send(`<!doctype html>
<html><head><meta http-equiv="refresh" content="0; url=${escapeAttr(callback.toString())}" /></head>
<body>${successPage({ email, autoClose: true })}
<script>window.location.replace(${JSON.stringify(callback.toString())});</script>
</body></html>`);
    }
  );

  // MCP endpoint. Bearer-protected. SDK's requireBearerAuth middleware verifies
  // the token via our provider, then we hand the JSON-RPC body to the
  // transport.
  const mcpAuth = requireBearerAuth({ verifier: provider });
  app.all(
    "/mcp",
    mcpAuth,
    express.json({ limit: "2mb" }),
    async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const mcp = buildMcpServer();
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        mcp.close();
      });
    }
  );

  app.get("/healthz", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[unify-mcp] http error: ${msg}\n`);
    if (!res.headersSent) res.status(500).type("text/plain").send(msg);
  });

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  process.stderr.write(
    `[unify-mcp] HTTP MCP server listening on http://${host}:${port}\n` +
      `  Register with Claude Code:\n` +
      `    claude mcp add --transport http unify http://${host}:${port}/mcp\n`
  );
}

function buildMcpServer(): Server {
  const server = new Server(
    { name: "unify-mcp", version: "0.5.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.schema, { target: "draft-2020-12" }),
      annotations: {
        readOnlyHint: t.isMutation !== true,
        destructiveHint: t.isMutation === true,
        idempotentHint: t.isMutation !== true,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findTool(request.params.name);
    if (!tool) return errorResult(`Unknown tool: ${request.params.name}`);

    const parsed = tool.schema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      return errorResult(
        `Invalid arguments for ${tool.name}: ${parsed.error.message}`
      );
    }

    try {
      const result = await tool.handler(parsed.data);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });

  return server;
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
    : c === "<" ? "&lt;"
    : c === ">" ? "&gt;"
    : c === '"' ? "&quot;"
    : "&#39;"
  );
}
