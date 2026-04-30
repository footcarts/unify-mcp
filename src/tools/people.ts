import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { summarizeListsForObject, summarizePeople } from "./summarize.js";
import { define } from "./types.js";

export const searchPeople = define({
  name: "search_unify_people",
  description:
    "Free-text search Unify people by name/email. Returns id, email, name, lead_source, company, recordOwner. Use page+limit for pagination.",
  schema: z.object({
    search: z.string().describe("query string"),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(20),
    full: z.boolean().default(false).describe("return raw API response (all fields per row)"),
  }),
  handler: async ({ search, page, limit, full }) => {
    const raw = await appApi({
      method: "GET",
      path: "/secure/people",
      query: { search, page, limit },
    });
    return full ? raw : summarizePeople(raw);
  },
});

export const getPerson = define({
  name: "get_unify_person",
  description:
    "Fetch a Unify person by id or email. Returns the full record (id, name, email, phones, title, status, recordOwner, lastWebsiteActivityAt, lead_source, company link, plus all custom fields).",
  schema: z
    .object({
      personId: z.string().min(1).optional(),
      email: z.string().email().optional(),
    })
    .refine((v) => v.personId || v.email, "personId or email required"),
  handler: async ({ personId, email }) => {
    if (personId) {
      return appApi({
        method: "GET",
        path: `/secure/people/${personId}`,
      });
    }
    return appApi({
      method: "GET",
      path: "/secure/people",
      query: { search: email, page: 0, limit: 1 },
    });
  },
});

export const listPersonNotes = define({
  name: "list_unify_person_notes",
  description: "List published + draft notes for a Unify person, paginated.",
  schema: z.object({
    personId: z.string().min(1),
    page: z.number().int().nonnegative().default(0),
  }),
  handler: async ({ personId, page }) =>
    appApi({
      method: "GET",
      path: `/secure/notes/people/${personId}`,
      query: { page },
    }),
});

export const listPersonSequenceEnrollments = define({
  name: "list_unify_person_sequence_enrollments",
  description:
    "List all sequence enrollments (active + finished) for a Unify person, including step-level execution history.",
  schema: z.object({ personId: z.string().min(1) }),
  handler: async ({ personId }) =>
    appApi({
      method: "GET",
      path: `/secure/people/${personId}/sequence-enrollments`,
    }),
});

export const listPersonOpportunities = define({
  name: "list_unify_person_opportunities",
  description: "List CRM opportunities associated with a Unify person.",
  schema: z.object({ personId: z.string().min(1) }),
  handler: async ({ personId }) =>
    appApi({
      method: "GET",
      path: `/secure/people/${personId}/opportunities`,
    }),
});

export const listPersonExclusions = define({
  name: "list_unify_person_exclusions",
  description: "List exclusion (suppression) rules currently affecting a Unify person.",
  schema: z.object({ personId: z.string().min(1) }),
  handler: async ({ personId }) =>
    appApi({
      method: "GET",
      path: `/secure/people/${personId}/exclusions`,
    }),
});

export const listPersonLists = define({
  name: "list_unify_person_lists",
  description:
    "List all Lists with a membership flag (objectEntryId is set when this person is in the list).",
  schema: z.object({
    personId: z.string().min(1),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  handler: async ({ personId, limit }) =>
    summarizeListsForObject(
      await appApi({
        method: "GET",
        path: "/secure/lists/for-object/PERSON",
        query: {
          personId,
          objectId: personId,
          limit,
          sortBy: "Name",
          sortOrder: "ASCENDING",
        },
      })
    ),
});
