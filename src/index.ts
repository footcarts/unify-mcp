import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { browserLogin } from "./auth/browser-login.js";
import { CredentialsRequired } from "./auth/session.js";
import { findTool, tools } from "./tools/index.js";

const server = new Server(
  { name: "unify-mcp", version: "0.4.0" },
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

async function promptForCredentials(): Promise<{ ok: boolean; message?: string }> {
  // Spin up a local HTTP server bound to 127.0.0.1, open the user's default
  // browser to a sign-in form, wait for them to submit. No client-elicitation
  // needed — works on every MCP client.
  let openedUrl: string | undefined;
  try {
    await browserLogin({
      onUrlReady: (url) => {
        openedUrl = url;
        process.stderr.write(
          `\n[unify-mcp] Sign-in page opened in browser:\n  ${url}\n\n`
        );
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const urlHint = openedUrl
      ? ` If the browser didn't open, visit: ${openedUrl}`
      : "";
    return {
      ok: false,
      message:
        `Unify sign-in did not complete (${msg}).${urlHint}` +
        " You can also run `unify-mcp login` in a terminal, or call the `unify_login` tool.",
    };
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = findTool(request.params.name);
  if (!tool) return errorResult(`Unknown tool: ${request.params.name}`);

  const parsed = tool.schema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return errorResult(`Invalid arguments for ${tool.name}: ${parsed.error.message}`);
  }

  const run = async () => tool.handler(parsed.data);

  try {
    const result = await run();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    if (err instanceof CredentialsRequired) {
      const prompt = await promptForCredentials();
      if (!prompt.ok) {
        return errorResult(
          prompt.message ??
            "Unify credentials required. Run `unify-mcp login` or call the `unify_login` tool."
        );
      }
      try {
        const result = await run();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (retryErr) {
        return errorResult(
          retryErr instanceof Error ? retryErr.message : String(retryErr)
        );
      }
    }
    return errorResult(err instanceof Error ? err.message : String(err));
  }
});

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
