// Explicit registry — no Object.values spread, no surprises.
import {
  getAudience,
  getAudiencePeopleCount,
  listAudiencePeople,
  listAudienceCompanies,
  listAudiences,
} from "./audiences.js";
import { getCompany, searchCompanies } from "./companies.js";
import {
  addToList,
  listLists,
  listListCompanyEntries,
  listListPersonEntries,
  removeFromList,
} from "./lists.js";
import { getDraftNote, postPersonNote } from "./notes.js";
import {
  getObjectRecord,
  listObjectRecords,
  listObjectTypes,
  sampleObjectRecords,
} from "./objects.js";
import {
  getPerson,
  listPersonExclusions,
  listPersonLists,
  listPersonNotes,
  listPersonOpportunities,
  listPersonSequenceEnrollments,
  searchPeople,
} from "./people.js";
import { getPlay, listPlays, triggerPlay } from "./plays.js";
import {
  checkEnrollmentReply,
  countEnrollmentsForAction,
  getEnrollmentSteps,
  getSequence,
  getSequenceMetrics,
  listBackgroundActions,
  listSequenceEnrollments,
  listSequences,
  unenrollFromSequence,
} from "./sequences.js";
import { createTask, getUnseenTaskCount } from "./tasks.js";
import { ToolDef } from "./types.js";
import { previewCsv, uploadCsv } from "./upload.js";
import {
  getCurrentUser,
  listFolders,
  listMailboxes,
  listSnippets,
} from "./workspace.js";

export const tools: ToolDef[] = [
  // people
  searchPeople,
  getPerson,
  listPersonNotes,
  listPersonSequenceEnrollments,
  listPersonOpportunities,
  listPersonExclusions,
  listPersonLists,
  // companies
  searchCompanies,
  getCompany,
  // sequences
  listSequences,
  getSequence,
  getSequenceMetrics,
  listSequenceEnrollments,
  getEnrollmentSteps,
  checkEnrollmentReply,
  countEnrollmentsForAction,
  unenrollFromSequence,
  listBackgroundActions,
  // audiences
  listAudiences,
  getAudience,
  listAudiencePeople,
  listAudienceCompanies,
  getAudiencePeopleCount,
  // lists
  listLists,
  listListPersonEntries,
  listListCompanyEntries,
  addToList,
  removeFromList,
  // plays
  listPlays,
  getPlay,
  triggerPlay,
  // notes
  getDraftNote,
  postPersonNote,
  // tasks
  createTask,
  getUnseenTaskCount,
  // bulk csv upload
  uploadCsv,
  previewCsv,
  // schema introspection
  listObjectTypes,
  sampleObjectRecords,
  getObjectRecord,
  listObjectRecords,
  // workspace
  getCurrentUser,
  listMailboxes,
  listSnippets,
  listFolders,
];

export const findTool = (name: string): ToolDef | undefined =>
  tools.find((t) => t.name === name);
