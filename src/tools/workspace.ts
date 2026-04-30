import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { define } from "./types.js";

export const getCurrentUser = define({
  name: "get_unify_current_user",
  description:
    "Identity of the logged-in user (id, email, role, tenant, full permission flags).",
  schema: z.object({}),
  handler: async () => appApi({ method: "GET", path: "/secure/users/current" }),
});

export const listMailboxes = define({
  name: "list_unify_mailboxes",
  description:
    "List sending mailboxes (id, emailAddress, displayName, primaryUser, provider, isPaused, isUnauthorized).",
  schema: z.object({}),
  handler: async () => appApi({ method: "GET", path: "/secure/email/mailboxes" }),
});

export const listSnippets = define({
  name: "list_unify_snippets",
  description:
    "List snippets (reusable content blocks for emails, including SMART snippets with AI prompts).",
  schema: z.object({
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  handler: async ({ page, limit }) =>
    appApi({ method: "GET", path: "/secure/snippets", query: { page, limit } }),
});

export const listFolders = define({
  name: "list_unify_folders",
  description:
    "List folder tree for an entity type (LIST, AUDIENCE, SEQUENCE). Use to navigate organization structure.",
  schema: z.object({
    entityType: z.enum(["LIST", "AUDIENCE", "SEQUENCE"]),
    folderId: z.string().min(1).optional(),
  }),
  handler: async ({ entityType, folderId }) =>
    appApi({
      method: "GET",
      path: folderId
        ? `/secure/folders/${entityType}/${folderId}`
        : `/secure/folders/${entityType}`,
    }),
});
