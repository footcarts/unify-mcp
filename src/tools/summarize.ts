// Summarizers strip Unify list responses down to high-signal fields only.
// Full detail is always available via the corresponding get_* tool.

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const obj = (v: unknown): Json => (isObj(v) ? v : {});

const pick = (v: unknown, keys: string[]): Json => {
  const src = obj(v);
  const out: Json = {};
  for (const k of keys) if (k in src) out[k] = src[k];
  return out;
};

const arrAt = (raw: unknown, key: string): unknown[] | null => {
  if (!isObj(raw)) return null;
  const v = raw[key];
  return Array.isArray(v) ? v : null;
};

export const summarizeSequences = (raw: unknown): unknown => {
  const arr = arrAt(raw, "sequences");
  if (!arr) return raw;
  return {
    sequences: arr.map((s) =>
      pick(s, ["id", "name", "isPaused", "createdAt", "createdBy", "ownerId", "folderId", "starred"])
    ),
  };
};

export const summarizeAudiences = (raw: unknown): unknown => {
  const arr = arrAt(raw, "audiences");
  if (!arr) return raw;
  return {
    audiences: arr.map((a) => {
      const plays = obj(a).plays;
      return {
        ...pick(a, ["id", "name", "ownerId", "createdAt", "createdBy", "folderId", "starred"]),
        playCount: Array.isArray(plays) ? plays.length : 0,
      };
    }),
  };
};

export const summarizePlays = (raw: unknown): unknown => {
  const arr = arrAt(raw, "plays");
  if (!arr) return raw;
  return {
    plays: arr.map((p) =>
      pick(p, [
        "id",
        "name",
        "publishedObjectType",
        "isPaused",
        "isDeleted",
        "createdAt",
        "createdBy",
        "ownerId",
        "folderId",
        "starred",
        "needsAttention",
      ])
    ),
  };
};

export const summarizeLists = (raw: unknown): unknown => {
  const arr = arrAt(raw, "lists");
  if (!arr) return raw;
  return {
    lists: arr.map((l) =>
      pick(l, ["id", "name", "objectModel", "ownerId", "createdAt", "createdBy", "folderId", "starred", "isDeleted"])
    ),
  };
};

export const summarizeListsForObject = (raw: unknown): unknown => {
  const arr = arrAt(raw, "listsForObject");
  if (!arr) return raw;
  return {
    listsForObject: arr.map((l) =>
      pick(l, ["id", "name", "objectModel", "objectEntryId", "ownerId", "starred"])
    ),
  };
};

export const summarizeEnrollments = (raw: unknown): unknown => {
  const arr = arrAt(raw, "enrollments");
  if (!arr) return raw;
  return {
    enrollments: arr.map((e) => {
      const o = obj(e);
      const steps = Array.isArray(o.stepExecutions) ? o.stepExecutions : [];
      const current = steps.find((s) => obj(s).isCurrent === true);
      return {
        id: o.id,
        sequenceId: o.sequenceId,
        sequenceName: o.sequenceName,
        sequenceVersionNumber: o.sequenceVersionNumber,
        status: o.status,
        displayStatus: o.displayStatus,
        substatuses: o.substatuses,
        person: pick(o.person, ["id", "name", "email", "leadSource", "recordOwner"]),
        mailbox: pick(o.mailbox, ["emailAddress", "displayName"]),
        currentStep: current ? pick(current, ["stepNumber", "stepType", "status"]) : null,
        totalSteps: steps.length,
      };
    }),
  };
};

export const summarizeSnippets = (raw: unknown): unknown => {
  const arr = arrAt(raw, "snippets");
  if (!arr) return raw;
  return {
    snippets: arr.map((s) =>
      pick(s, ["id", "name", "createdAt", "createdBy", "ownerId", "starred"])
    ),
  };
};

export const summarizePeople = (raw: unknown): unknown => {
  const arr = arrAt(raw, "people");
  if (!arr) return raw;
  return {
    people: arr.map((p) =>
      pick(p, [
        "id",
        "name",
        "email",
        "title",
        "status",
        "mobilePhone",
        "leadSource",
        "lastWebsiteActivityAt",
        "lastActivityDate",
        "linkedinUrl",
        "recordOwner",
        "companyId",
        "companyName",
        "companyDomain",
        "hubspotUrl",
        "salesforceUrl",
      ])
    ),
    nextPage: obj(raw).nextPage,
    totalPeople: obj(raw).totalPeople,
  };
};

export const summarizeCompanies = (raw: unknown): unknown => {
  const arr = arrAt(raw, "companies");
  if (!arr) return raw;
  return {
    companies: arr.map((c) => {
      const o = obj(c);
      return {
        id: o.id,
        name: o.name,
        domain: o.domain,
        address: o.address,
        employeeCount: o.employeeCount,
        revenue: o.revenue,
        industry: o.industry,
        leadSource: o.leadSource,
        status: o.status,
        lastActivityDate: o.lastActivityDate,
        lastWebsiteActivityAt: o.lastWebsiteActivityAt,
        recordOwner: o.recordOwner,
        intentLevel: obj(o.intent).level,
        hubspotUrl: o.hubspotUrl,
        salesforceUrl: o.salesforceUrl,
      };
    }),
    nextPage: obj(raw).nextPage,
    totalCompanies: obj(raw).totalCompanies,
  };
};

export const summarizeSequence = (raw: unknown): unknown => {
  if (!isObj(raw) || !isObj(raw.sequence)) return raw;
  const s = raw.sequence;
  const lv = obj(s.latestVersion);
  const namespaces = Array.isArray(lv.namespaces) ? lv.namespaces : [];
  const steps = namespaces.flatMap((ns) =>
    Array.isArray(obj(ns).steps) ? (obj(ns).steps as unknown[]) : []
  );
  return {
    sequence: {
      ...pick(s, [
        "id",
        "name",
        "isPaused",
        "createdAt",
        "createdBy",
        "ownerId",
        "folderId",
        "starred",
      ]),
      latestVersion: {
        version: lv.version,
        lastModifiedAt: lv.lastModifiedAt,
        stepCount: steps.length,
        steps: steps.map((step) =>
          pick(step, ["id", "key", "type"])
        ),
      },
    },
  };
};

export const summarizeAudience = (raw: unknown): unknown => {
  if (!isObj(raw) || !isObj(raw.audience)) return raw;
  const a = raw.audience;
  const plays = Array.isArray(a.plays) ? a.plays : [];
  return {
    audience: {
      ...pick(a, [
        "id",
        "name",
        "ownerId",
        "createdAt",
        "createdBy",
        "folderId",
        "starred",
        "objectApiName",
        "operator",
      ]),
      plays: plays.map((p) => pick(p, ["id", "name", "isPaused"])),
      hasPersonFilter: a.personFiltersV2 !== null,
      hasCompanyFilter: a.companyFiltersV2 !== null,
    },
  };
};

export const summarizePlay = (raw: unknown): unknown => {
  if (!isObj(raw) || !isObj(raw.play)) return raw;
  const p = raw.play;
  return {
    play: pick(p, [
      "id",
      "name",
      "publishedObjectType",
      "isPaused",
      "isDeleted",
      "needsAttention",
      "createdAt",
      "createdBy",
      "ownerId",
      "folderId",
      "starred",
    ]),
  };
};

export const summarizeCurrentUser = (raw: unknown): unknown => {
  if (!isObj(raw) || !isObj(raw.user)) return raw;
  const u = raw.user;
  return {
    user: {
      ...pick(u, [
        "id",
        "email",
        "firstName",
        "lastName",
        "role",
        "customRole",
        "isAdmin",
        "isUnifyEmployee",
      ]),
      tenant: pick(u.tenant, ["id", "name", "domain", "accountType"]),
      permissionGroup: pick(u.permissionGroup, ["name"]),
    },
  };
};

export const summarizeListEntries = (raw: unknown): unknown => {
  // Generic summarizer for list-entry endpoints (person-entries / company-entries)
  if (!isObj(raw)) return raw;
  for (const key of ["personEntries", "companyEntries", "entries"]) {
    const arr = arrAt(raw, key);
    if (arr) {
      return {
        ...raw,
        [key]: arr.map((e) => {
          const o = obj(e);
          return {
            entryId: o.id ?? o.entryId,
            objectId: o.objectId ?? obj(o.person).id ?? obj(o.company).id,
            object: pick(o.person ?? o.company, [
              "id",
              "name",
              "email",
              "domain",
            ]),
            createdAt: o.createdAt,
          };
        }),
      };
    }
  }
  return raw;
};

export const summarizeMailboxes = (raw: unknown): unknown => {
  const arr = arrAt(raw, "mailboxes");
  if (!arr) return raw;
  return {
    mailboxes: arr.map((m) => {
      const o = obj(m);
      return {
        id: o.id,
        emailAddress: o.emailAddress,
        displayName: o.displayName,
        provider: o.provider,
        isPaused: o.isPaused,
        isUnauthorized: o.isUnauthorized,
        primaryUser: pick(o.primaryUser, ["id", "email", "fullName"]),
      };
    }),
  };
};
