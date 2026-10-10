import { z } from "zod";
import { text as displayText } from "../../support/input/schema.js";
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const text = displayText.min(1);
export const testLinksSchema = z.strictObject({
  apiVersion: z.literal("cca.dev/test-links/v1alpha1"),
  tests: z.array(z.strictObject({ id, file: text, title: text })),
  links: z.array(z.strictObject({ rule: id, tests: z.array(id).min(1) })),
});
export type TestLinks = z.infer<typeof testLinksSchema>;
