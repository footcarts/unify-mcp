import { z } from "zod";
import { appApi } from "../clients/app-api.js";
import { define } from "./types.js";

interface DraftResponse {
  note: { id: string } | null;
}

export const postPersonNote = define({
  name: "post_unify_person_note",
  description:
    "Publish a note on a Unify person record. Reuses an existing draft if one is open for the current user; otherwise creates+publishes. The body is HTML — wrap text content in <div class='unify-text'>...</div> blocks for proper rendering.",
  isMutation: true,
  schema: z.object({
    personId: z.string().min(1),
    htmlContent: z.string().min(1),
  }),
  handler: async ({ personId, htmlContent }) => {
    const existing = await appApi<DraftResponse>({
      method: "GET",
      path: "/secure/notes/draft",
      query: { personId },
    });

    let noteId = existing.note?.id ?? null;
    if (!noteId) {
      const draft = await appApi<DraftResponse>({
        method: "POST",
        path: "/secure/notes/draft",
        body: { htmlContent, personId },
      });
      noteId = draft.note?.id ?? null;
    }
    if (!noteId) throw new Error("Failed to create draft note");

    return appApi({
      method: "POST",
      path: `/secure/notes/${noteId}/publish`,
      body: { htmlContent },
    });
  },
});

export const getDraftNote = define({
  name: "get_unify_person_draft_note",
  description: "Get the current draft note (if any) for a Unify person.",
  schema: z.object({ personId: z.string().min(1) }),
  handler: async ({ personId }) =>
    appApi({
      method: "GET",
      path: "/secure/notes/draft",
      query: { personId },
    }),
});
