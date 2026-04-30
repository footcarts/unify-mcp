import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { summarizeCompanies } from "./summarize.js";
import { define } from "./types.js";

export const searchCompanies = define({
  name: "search_unify_companies",
  description:
    "Free-text search Unify companies by name/domain. Returns id, name, domain, address, employee count, revenue, intent.",
  schema: z.object({
    search: z.string(),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(20),
    full: z.boolean().default(false).describe("return raw API response (all fields per row)"),
  }),
  handler: async ({ search, page, limit, full }) => {
    const raw = await appApi({
      method: "GET",
      path: "/secure/companies",
      query: { search, page, limit },
    });
    return full ? raw : summarizeCompanies(raw);
  },
});

export const getCompany = define({
  name: "get_unify_company",
  description:
    "Fetch a Unify company by id or domain. Returns full record: address, industry, description, revenue, employeeCount, intent, recordOwner, social links, plus all custom fields.",
  schema: z
    .object({
      companyId: z.string().min(1).optional(),
      domain: z.string().optional(),
    })
    .refine((v) => v.companyId || v.domain, "companyId or domain required"),
  handler: async ({ companyId, domain }) => {
    if (companyId) {
      return appApi({
        method: "GET",
        path: `/secure/companies/${companyId}`,
      });
    }
    return appApi({
      method: "GET",
      path: "/secure/companies",
      query: { search: domain, page: 0, limit: 1 },
    });
  },
});
