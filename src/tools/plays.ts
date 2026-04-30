import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { summarizePlay, summarizePlays } from "./summarize.js";
import { define } from "./types.js";

export const listPlays = define({
  name: "list_unify_plays",
  description:
    "List plays. Filter by objectType to get only PERSON-targeting or COMPANY-targeting plays.",
  schema: z.object({
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(50).default(20),
    search: z.string().default(""),
    objectType: z.enum(["PERSON", "COMPANY"]).optional(),
    excludeDraftOnly: z.boolean().default(true),
  }),
  handler: async ({ page, limit, search, objectType, excludeDraftOnly }) =>
    summarizePlays(
      await appApi({
        method: "GET",
        path: "/secure/plays",
        query: {
          page,
          limit,
          search,
          sortBy: "Name",
          sortOrder: "ASCENDING",
          objectType,
          excludeDraftOnly,
        },
      })
    ),
});

export const getPlay = define({
  name: "get_unify_play",
  description:
    "Fetch a play definition (publishedObjectType, owner, isPaused, settings, retrigger config).",
  schema: z.object({ playId: z.string().min(1) }),
  handler: async ({ playId }) =>
    summarizePlay(await appApi({ method: "GET", path: `/secure/plays/${playId}` })),
});

export const triggerPlay = define({
  name: "trigger_unify_play",
  description:
    "Trigger a play for one or more people/companies (object ids). Returns immediately; the play runs async.",
  isMutation: true,
  schema: z.object({
    playId: z.string().min(1),
    objectIds: z.array(z.string().min(1)).min(1),
  }),
  handler: async ({ playId, objectIds }) =>
    appApi({
      method: "POST",
      path: `/secure/plays/${playId}/trigger`,
      body: { objectIds },
    }),
});
