import { z } from "zod";
import { getCompany, searchCompanies } from "./companies.js";
import { getPerson, searchPeople } from "./people.js";
import { define } from "./types.js";

const SUPPORTED = ["person", "company"] as const;
const objectTypeSchema = z.enum(SUPPORTED);

export const listObjectTypes = define({
  name: "list_unify_object_types",
  description:
    "List the Unify object types this MCP can introspect. Each type has dedicated search/get/sample tools.",
  schema: z.object({}),
  handler: async () => ({
    objectTypes: SUPPORTED.map((api_name) => ({
      api_name,
      display_name: api_name === "person" ? "Person" : "Company",
      list_tool:
        api_name === "person" ? "search_unify_people" : "search_unify_companies",
      get_tool:
        api_name === "person" ? "get_unify_person" : "get_unify_company",
      sample_tool: "sample_unify_object_records",
    })),
  }),
});

export const sampleObjectRecords = define({
  name: "sample_unify_object_records",
  description:
    "Fetch a few records of an object type to discover all attribute keys (including custom fields). Unify has no /schema endpoint, so we sample records and reflect the keys present.",
  schema: z.object({
    objectType: objectTypeSchema,
    limit: z.number().int().min(1).max(20).default(3),
  }),
  handler: async ({ objectType, limit }) => {
    const tool = objectType === "person" ? searchPeople : searchCompanies;
    return tool.handler({ search: "", page: 0, limit, full: false });
  },
});

export const getObjectRecord = define({
  name: "get_unify_object_record",
  description:
    "Fetch one record by id from any object type. Returns full attributes including custom fields.",
  schema: z.object({
    objectType: objectTypeSchema,
    recordId: z.string().min(1),
  }),
  handler: async ({ objectType, recordId }) =>
    objectType === "person"
      ? getPerson.handler({ personId: recordId })
      : getCompany.handler({ companyId: recordId }),
});

export const listObjectRecords = define({
  name: "list_unify_object_records",
  description:
    "Page through records of an object type. Optionally filter with a free-text search.",
  schema: z.object({
    objectType: objectTypeSchema,
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(50),
    search: z.string().default(""),
  }),
  handler: async ({ objectType, page, limit, search }) => {
    const tool = objectType === "person" ? searchPeople : searchCompanies;
    return tool.handler({ search, page, limit, full: false });
  },
});
