import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { define } from "./types.js";

export const createTask = define({
  name: "create_unify_task",
  description:
    "Create a follow-up task on a Unify person. Type is the task category (PHONE_CALL, EMAIL, etc), priority is HIGH/MEDIUM/LOW, dueAt is an ISO timestamp.",
  isMutation: true,
  schema: z.object({
    personId: z.string().min(1),
    type: z.string().default("PHONE_CALL"),
    status: z.enum(["READY", "DRAFT"]).default("READY"),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
    assignedUserId: z.string().min(1),
    dueAt: z.string().describe("ISO datetime string"),
    noteContent: z.string().default(""),
  }),
  handler: async (input) =>
    appApi({
      method: "POST",
      path: "/secure/tasks/create",
      body: input,
    }),
});

export const getUnseenTaskCount = define({
  name: "get_unify_unseen_task_count",
  description: "Number of unseen tasks for the current user.",
  schema: z.object({}),
  handler: async () =>
    appApi({ method: "GET", path: "/secure/tasks/unseen-count" }),
});
