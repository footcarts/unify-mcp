import { z } from "zod";

export interface ToolDef<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: I;
  handler: (input: z.infer<I>) => Promise<unknown>;
  /** Set true for tools with side effects (writes / deletions). */
  isMutation?: boolean;
}

export const define = <I extends z.ZodTypeAny>(t: ToolDef<I>): ToolDef<I> => t;
