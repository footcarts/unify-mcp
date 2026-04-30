import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { summarizeAudience, summarizeAudiences } from "./summarize.js";
import { define } from "./types.js";

export const listAudiences = define({
  name: "list_unify_audiences",
  description: "List audiences (filter-based dynamic groups) in the workspace.",
  schema: z.object({
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  handler: async ({ page, limit }) =>
    summarizeAudiences(
      await appApi({ method: "GET", path: "/secure/audiences", query: { page, limit } })
    ),
});

export const getAudience = define({
  name: "get_unify_audience",
  description:
    "Fetch an audience definition with its filter tree (personFiltersV2 / companyFiltersV2) and linked plays.",
  schema: z.object({ audienceId: z.string().min(1) }),
  handler: async ({ audienceId }) =>
    summarizeAudience(
      await appApi({ method: "GET", path: `/secure/audiences/${audienceId}` })
    ),
});

export const listAudiencePeople = define({
  name: "list_unify_audience_people",
  description: "List people currently matching an audience filter, paginated.",
  schema: z.object({
    audienceId: z.string().min(1),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(50),
    search: z.string().default(""),
    sortBy: z.string().default("Name"),
    sortOrder: z.enum(["ASCENDING", "DESCENDING"]).default("ASCENDING"),
  }),
  handler: async ({ audienceId, page, limit, search, sortBy, sortOrder }) =>
    appApi({
      method: "GET",
      path: `/secure/audiences/${audienceId}/people`,
      query: { page, limit, search, sortBy, sortOrder },
    }),
});

export const listAudienceCompanies = define({
  name: "list_unify_audience_companies",
  description: "List companies currently matching an audience filter, paginated.",
  schema: z.object({
    audienceId: z.string().min(1),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(50),
    search: z.string().default(""),
    sortBy: z.string().default("Last Website Activity"),
    sortOrder: z.enum(["ASCENDING", "DESCENDING"]).default("DESCENDING"),
  }),
  handler: async ({ audienceId, page, limit, search, sortBy, sortOrder }) =>
    appApi({
      method: "GET",
      path: `/secure/audiences/${audienceId}/companies`,
      query: { page, limit, search, sortBy, sortOrder },
    }),
});

export const getAudiencePeopleCount = define({
  name: "get_unify_audience_people_count",
  description: "Total number of people currently matching an audience.",
  schema: z.object({ audienceId: z.string().min(1) }),
  handler: async ({ audienceId }) =>
    appApi({
      method: "GET",
      path: `/secure/audiences/${audienceId}/people/count`,
    }),
});
