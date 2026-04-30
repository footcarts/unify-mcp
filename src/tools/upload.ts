import axios from "axios";
import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { define } from "./types.js";

const personMappingSchema = z
  .object({
    email: z.string().nullable().default(null),
    firstName: z.string().nullable().default(null),
    lastName: z.string().nullable().default(null),
    linkedinUrl: z.string().nullable().default(null),
  })
  .passthrough();

const companyMappingSchema = z
  .object({
    domain: z.string().nullable().default(null),
    name: z.string().nullable().default(null),
  })
  .passthrough();

const fileInitResponseSchema = z.object({
  s3UploadUrl: z.string(),
});

function extractFileId(s3UploadUrl: string): string {
  // unifygtm-assets.s3.../person-csvs/{tenantId}/{fileId}?X-Amz-...
  const u = new URL(s3UploadUrl);
  const parts = u.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) throw new Error("Unify upload URL missing file id");
  return last;
}

async function putToS3(s3UploadUrl: string, csv: string): Promise<void> {
  const res = await axios({
    method: "PUT",
    url: s3UploadUrl,
    data: csv,
    headers: { "content-type": "text/csv" },
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`S3 upload failed (status ${res.status})`);
  }
}

export const uploadCsv = define({
  name: "upload_unify_csv",
  description:
    "Bulk-import new people or companies into Unify from a CSV. Creates a List containing the imported records. The CSV's first row must be header names. Map CSV column names to Unify fields via personMapping / companyMapping (e.g. {\"email\": \"work_email\", \"firstName\": \"first\"}). Pass null for fields you don't have. Set objectModel='PERSON' for a people list or 'COMPANY' for a company list. Enrichment is OFF by default — set enrichEmails/enrichPhones=true to consume Unify credits to enrich missing fields.",
  isMutation: true,
  schema: z.object({
    csvContent: z.string().min(1).describe("Raw CSV text including header row"),
    name: z.string().min(1).describe("Name of the List to create"),
    objectModel: z
      .enum(["PERSON", "COMPANY"])
      .describe("Whether the CSV contains people or companies"),
    personMapping: personMappingSchema.optional(),
    companyMapping: companyMappingSchema.optional(),
    enrichEmails: z.boolean().default(false),
    enrichPhones: z.boolean().default(false),
    folderId: z.string().min(1).nullable().default(null),
    shareStatus: z
      .enum(["ALL_OTHERS_CAN_EDIT", "ALL_OTHERS_CAN_VIEW", "PRIVATE"])
      .default("ALL_OTHERS_CAN_EDIT"),
  }),
  handler: async ({
    csvContent,
    name,
    objectModel,
    personMapping,
    companyMapping,
    enrichEmails,
    enrichPhones,
    folderId,
    shareStatus,
  }) => {
    const uploadType = objectModel === "PERSON" ? "PERSON_CSV" : "COMPANY_CSV";
    const sizeInBytes = Buffer.byteLength(csvContent, "utf8");
    const fileName =
      `${objectModel.toLowerCase()}-${Date.now()}.csv`.replace(/\s+/g, "-");

    // 1) Init: register the file with Unify, get a presigned S3 PUT URL
    const init = await appApi({
      method: "POST",
      path: "/secure/files",
      body: { uploadType, name: fileName, mimeType: "text/csv", sizeInBytes },
    });
    const parsed = fileInitResponseSchema.safeParse(init);
    if (!parsed.success) throw new Error("Unify /secure/files response missing s3UploadUrl");
    const { s3UploadUrl } = parsed.data;
    const fileId = extractFileId(s3UploadUrl);

    // 2) Upload the CSV to S3
    await putToS3(s3UploadUrl, csvContent);

    // 3) Commit: create the List + import records using the uploaded file
    const finalPersonMapping =
      personMapping ?? { email: null, firstName: null, lastName: null, linkedinUrl: null };
    const finalCompanyMapping = companyMapping ?? { domain: null };

    const result = await appApi({
      method: "POST",
      path: "/secure/lists/from-csv",
      body: {
        fileId,
        fileUploadType: uploadType,
        folderId,
        personMapping: finalPersonMapping,
        companyMapping: finalCompanyMapping,
        isEmailEnrichmentEnabled: enrichEmails,
        isPhoneEnrichmentEnabled: enrichPhones,
        name,
        shareStatus,
        sharedWithUsers: [],
        objectModel,
      },
    });
    return result;
  },
});

export const previewCsv = define({
  name: "preview_unify_csv_upload",
  description:
    "Validate a CSV's column→Unify-field mapping before committing. Uploads the CSV to a draft, returns parsed sample rows. No List is created. Use this to confirm mappings are correct before calling upload_unify_csv.",
  schema: z.object({
    csvContent: z.string().min(1),
    objectModel: z.enum(["PERSON", "COMPANY"]),
    personMapping: personMappingSchema.optional(),
    companyMapping: companyMappingSchema.optional(),
  }),
  handler: async ({ csvContent, objectModel, personMapping, companyMapping }) => {
    const uploadType = objectModel === "PERSON" ? "PERSON_CSV" : "COMPANY_CSV";
    const sizeInBytes = Buffer.byteLength(csvContent, "utf8");
    const fileName = `${objectModel.toLowerCase()}-preview-${Date.now()}.csv`;

    const init = await appApi({
      method: "POST",
      path: "/secure/files",
      body: { uploadType, name: fileName, mimeType: "text/csv", sizeInBytes },
    });
    const parsed = fileInitResponseSchema.safeParse(init);
    if (!parsed.success) throw new Error("Unify /secure/files response missing s3UploadUrl");
    const fileId = extractFileId(parsed.data.s3UploadUrl);
    await putToS3(parsed.data.s3UploadUrl, csvContent);

    const fields = await appApi({
      method: "GET",
      path: `/secure/files/${fileId}/fields`,
    });
    const previewPath =
      objectModel === "PERSON"
        ? `/secure/files/${fileId}/person-preview`
        : `/secure/files/${fileId}/company-preview`;
    const finalPersonMapping =
      personMapping ?? { email: null, firstName: null, lastName: null, linkedinUrl: null };
    const finalCompanyMapping = companyMapping ?? { domain: null };
    const preview = await appApi({
      method: "POST",
      path: previewPath,
      body: { personMapping: finalPersonMapping, companyMapping: finalCompanyMapping },
    });
    return { fileId, fields, preview };
  },
});
