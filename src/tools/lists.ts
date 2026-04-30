import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { summarizeListEntries, summarizeLists } from "./summarize.js";
import { define } from "./types.js";

export const listLists = define({
  name: "list_unify_lists",
  description:
    "List static-membership Lists. objectModel is 'PERSON' or 'COMPANY'.",
  schema: z.object({
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(50),
    search: z.string().default(""),
    objectModel: z.enum(["PERSON", "COMPANY"]).optional(),
  }),
  handler: async ({ page, limit, search, objectModel }) =>
    summarizeLists(
      await appApi({
        method: "GET",
        path: "/secure/lists",
        query: {
          page,
          limit,
          search,
          sortBy: "Name",
          sortOrder: "ASCENDING",
          objectModel,
        },
      })
    ),
});

export const listListPersonEntries = define({
  name: "list_unify_list_person_entries",
  description:
    "List people in a Person-list. Each entry has its own membership id (selectedEntryIds for removal).",
  schema: z.object({
    listId: z.string().min(1),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  handler: async ({ listId, page, limit }) =>
    summarizeListEntries(
      await appApi({
        method: "GET",
        path: `/secure/lists/${listId}/person-entries`,
        query: { page, limit },
      })
    ),
});

export const listListCompanyEntries = define({
  name: "list_unify_list_company_entries",
  description: "List companies in a Company-list.",
  schema: z.object({
    listId: z.string().min(1),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  handler: async ({ listId, page, limit }) =>
    summarizeListEntries(
      await appApi({
        method: "GET",
        path: `/secure/lists/${listId}/company-entries`,
        query: { page, limit },
      })
    ),
});

export const addToList = define({
  name: "add_to_unify_list",
  description:
    "Add one or more people/companies to a List. Pass the List's matching object IDs (personId or companyId).",
  isMutation: true,
  schema: z.object({
    listId: z.string().min(1),
    objectIds: z.array(z.string().min(1)).min(1),
    addedFrom: z.string().default("MCP"),
  }),
  handler: async ({ listId, objectIds, addedFrom }) =>
    appApi({
      method: "POST",
      path: `/secure/lists/${listId}/bulk-add-entries`,
      body: { objectIds, addedFrom },
    }),
});

export const removeFromList = define({
  name: "remove_from_unify_list",
  description:
    "Remove entries from a List. Pass the membership entry ids (objectEntryId from list_unify_person_lists or list-entries calls).",
  isMutation: true,
  schema: z.object({
    listId: z.string().min(1),
    selectedEntryIds: z.array(z.string().min(1)).min(1),
  }),
  handler: async ({ listId, selectedEntryIds }) =>
    appApi({
      method: "POST",
      path: `/secure/lists/${listId}/bulk-remove-entries-sync`,
      body: { allSelected: false, selectedEntryIds, unselectedEntryIds: [] },
    }),
});
