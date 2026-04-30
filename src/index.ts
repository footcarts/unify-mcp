import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { findTool, tools } from "./tools/index.js";

const server = new Server(
  { name: "unify-mcp", version: "0.1.0" },
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
  if (!tool) {
    return errorResult(`Unknown tool: ${request.params.name}`);
  }
  const parsed = tool.schema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return errorResult(`Invalid arguments for ${tool.name}: ${parsed.error.message}`);
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

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
