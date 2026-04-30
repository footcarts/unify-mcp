import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import {
  summarizeEnrollments,
  summarizeSequence,
  summarizeSequences,
} from "./summarize.js";
import { define } from "./types.js";

export const listSequences = define({
  name: "list_unify_sequences",
  description: "List sequences in the workspace. Returns summarized rows (id/name/owner/etc); pass full=true for raw API output (large — includes full step bodies).",
  schema: z.object({
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(50).default(20),
    full: z.boolean().default(false),
  }),
  handler: async ({ page, limit, full }) => {
    const raw = await appApi({ method: "GET", path: "/secure/sequences", query: { page, limit } });
    return full ? raw : summarizeSequences(raw);
  },
});

export const getSequence = define({
  name: "get_unify_sequence",
  description:
    "Fetch a sequence definition with ordered steps and version metadata. By default step bodies (email HTML) are stripped; pass full=true to get raw output.",
  schema: z.object({
    sequenceId: z.string().min(1),
    full: z.boolean().default(false),
  }),
  handler: async ({ sequenceId, full }) => {
    const raw = await appApi({ method: "GET", path: `/secure/sequences/${sequenceId}` });
    return full ? raw : summarizeSequence(raw);
  },
});

export const getSequenceMetrics = define({
  name: "get_unify_sequence_metrics",
  description:
    "Funnel breakdown for a sequence: total/inProgress/finished (subdivided by completed/replied/bounced/optedOut/excluded).",
  schema: z.object({ sequenceId: z.string().min(1) }),
  handler: async ({ sequenceId }) =>
    appApi({
      method: "GET",
      path: `/secure/sequences/${sequenceId}/enrollments/metrics`,
    }),
});

export const listSequenceEnrollments = define({
  name: "list_unify_sequence_enrollments",
  description:
    "List enrollments for a sequence with status, displayStatus, substatuses (isReplied/isBounced/etc), person, mailbox, and per-step executions. Paginated.",
  schema: z.object({
    sequenceId: z.string().min(1),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(50),
    status: z.enum(["IN_PROGRESS", "FINISHED"]).optional(),
    full: z.boolean().default(false),
  }),
  handler: async ({ sequenceId, page, limit, status, full }) => {
    const raw = await appApi({
      method: "GET",
      path: `/secure/sequences/${sequenceId}/enrollments`,
      query: { page, limit, status },
    });
    return full ? raw : summarizeEnrollments(raw);
  },
});

export const getEnrollmentSteps = define({
  name: "get_unify_enrollment_steps",
  description:
    "Per-step execution history for a single enrollment (one entry per step with status/startedAt/endedAt).",
  schema: z.object({ enrollmentId: z.string().min(1) }),
  handler: async ({ enrollmentId }) =>
    appApi({
      method: "GET",
      path: `/secure/sequences/enrollments/${enrollmentId}/steps`,
    }),
});

export const checkEnrollmentReply = define({
  name: "check_unify_enrollment_reply",
  description: "Whether a given enrollment has received a reply.",
  schema: z.object({ enrollmentId: z.string().min(1) }),
  handler: async ({ enrollmentId }) =>
    appApi({
      method: "GET",
      path: `/secure/sequences/enrollments/${enrollmentId}/check-reply`,
    }),
});

export const countEnrollmentsForAction = define({
  name: "count_unify_enrollments_for_action",
  description:
    "Dry-run: count how many enrollments would be affected by a bulk action (use before unenroll). excludeStatuses defaults to ['FINISHED'].",
  schema: z.object({
    sequenceId: z.string().min(1),
    enrollmentIds: z.array(z.string().min(1)).min(1),
    excludeStatuses: z.array(z.string()).default(["FINISHED"]),
  }),
  handler: async ({ sequenceId, enrollmentIds, excludeStatuses }) =>
    appApi({
      method: "POST",
      path: `/secure/sequences/${sequenceId}/enrollments/total`,
      body: { query: { includeIds: enrollmentIds, excludeStatuses } },
    }),
});

export const unenrollFromSequence = define({
  name: "unenroll_unify_persons_from_sequence",
  description:
    "Bulk-unenroll people from a sequence. Does NOT affect already-FINISHED enrollments. Returns immediately; the action runs as a background-action.",
  isMutation: true,
  schema: z.object({
    sequenceId: z.string().min(1),
    enrollmentIds: z.array(z.string().min(1)).min(1),
    excludeStatuses: z.array(z.string()).default(["FINISHED"]),
  }),
  handler: async ({ sequenceId, enrollmentIds, excludeStatuses }) =>
    appApi({
      method: "POST",
      path: `/secure/sequences/${sequenceId}/enrollments/bulk-action`,
      body: {
        action: "UNENROLL",
        query: { includeIds: enrollmentIds, excludeStatuses },
      },
    }),
});

export const listBackgroundActions = define({
  name: "list_unify_background_actions",
  description:
    "Status of recent bulk actions (UNENROLL/REASSIGN/UPGRADE/REFRESH/RESTART). Filter by sequenceId, status[], startedWithinHours.",
  schema: z.object({
    sequenceId: z.string().min(1).optional(),
    types: z
      .array(
        z.enum([
          "BULK_UNENROLL_FROM_SEQUENCE",
          "BULK_REASSIGN_SEQUENCE_MAILBOXES",
          "BULK_UPGRADE_SEQUENCE_ENROLLMENTS",
          "BULK_REFRESH_SEQUENCE_ENROLLMENTS",
          "BULK_RESTART_SEQUENCE_ENROLLMENTS",
        ])
      )
      .default(["BULK_UNENROLL_FROM_SEQUENCE"]),
    status: z
      .array(z.enum(["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELED"]))
      .default(["IN_PROGRESS", "COMPLETED", "FAILED"]),
    startedWithinHours: z.number().int().min(1).max(168).default(24),
  }),
  handler: async ({ sequenceId, types, status, startedWithinHours }) => {
    const params = new URLSearchParams();
    for (const t of types) params.append("types[]", t);
    for (const s of status) params.append("status[]", s);
    params.set("forCurrentUser", "false");
    params.set("startedWithinHours", String(startedWithinHours));
    if (sequenceId) params.set("sequenceId", sequenceId);
    return appApi({
      method: "GET",
      path: `/secure/background-actions?${params.toString()}`,
    });
  },
});
