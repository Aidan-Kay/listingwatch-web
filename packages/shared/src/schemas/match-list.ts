import { z } from "zod";
import { cleanTerms } from "../keyword-match/index.ts";

export const MAX_TERMS_PER_LIST = 20_000;

export const matchListInputSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(120),
  terms: z.array(z.string().max(1_000)).max(MAX_TERMS_PER_LIST).transform(cleanTerms),
});
export type MatchListInput = z.infer<typeof matchListInputSchema>;

export const matchListSchema = z.object({
  id: z.string(),
  name: z.string(),
  terms: z.array(z.string()),
  /** Bumped whenever the terms change; keys the compiled-list cache. */
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type MatchList = z.infer<typeof matchListSchema>;
