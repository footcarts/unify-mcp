import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CredentialsRequired, interactiveLogin } from "./auth/session.js";
import { findTool, tools } from "./tools/index.js";

const server = new Server(
  { name: "unify-mcp", version: "0.3.1" },
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

const elicitResultSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  content: z
    .object({ email: z.string(), password: z.string() })
    .optional(),
});

async function promptForCredentials(): Promise<boolean> {
  try {
    const res = await server.request(
      {
        method: "elicitation/create",
        params: {
          message:
            "Sign in to Unify to use this tool. Don't have a password? Reset it at https://app.unifygtm.com.",
          requestedSchema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                title: "Unify email",
                format: "email",
              },
              password: {
                type: "string",
                title: "Unify password",
                format: "password",
              },
            },
            required: ["email", "password"],
          },
        },
      },
      elicitResultSchema
    );
    if (res.action !== "accept" || !res.content) return false;
    await interactiveLogin(res.content.email, res.content.password);
    return true;
  } catch {
    return false;
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
      const ok = await promptForCredentials();
      if (!ok) {
        return errorResult(
          "Login required. Either accept the sign-in prompt in Claude, or run `unify-mcp login` in a terminal."
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
