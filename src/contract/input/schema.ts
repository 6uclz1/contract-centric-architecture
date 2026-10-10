import { z } from "zod";
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
import { text } from "../../support/input/schema.js";
const description = { description: text.optional() };
const baseField = { id, required: z.boolean(), ...description };
export const fieldSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...baseField, type: z.literal("string") }),
  z.strictObject({ ...baseField, type: z.literal("integer") }),
  z.strictObject({ ...baseField, type: z.literal("boolean") }),
  z.strictObject({ ...baseField, type: z.literal("date") }),
  z.strictObject({ ...baseField, type: z.literal("datetime") }),
  z.strictObject({
    ...baseField,
    type: z.literal("enum"),
    values: z
      .array(text)
      .min(1)
      .refine((v) => new Set(v).size === v.length, "Duplicate enum value"),
  }),
  z.strictObject({ ...baseField, type: z.literal("state"), machine: id }),
]);
const multiplicity = z.strictObject({
  min: z.union([z.literal(0), z.literal(1)]),
  max: z.union([z.literal(1), z.literal("many")]),
});
export const contractSchema = z.strictObject({
  apiVersion: z.literal("cca.dev/v1alpha1"),
  metadata: z.strictObject({ id, name: text, ...description }),
  entities: z.array(
    z.strictObject({
      id,
      name: text,
      ...description,
      fields: z.array(fieldSchema),
    }),
  ),
  relationships: z.array(
    z.strictObject({
      id,
      name: text,
      ...description,
      from: id,
      to: id,
      targetsPerSource: multiplicity,
      sourcesPerTarget: multiplicity,
    }),
  ),
  stateMachines: z.array(
    z.strictObject({
      id,
      ...description,
      entity: id,
      field: id,
      states: z.array(id).min(1),
      initial: id,
      transitions: z.array(
        z.strictObject({ id, ...description, from: id, to: id, command: id }),
      ),
    }),
  ),
  commands: z.array(
    z.strictObject({
      id,
      name: text,
      ...description,
      target: id,
      preconditions: z.array(id),
      postconditions: z.array(id),
      effects: z.array(
        z.strictObject({
          id,
          kind: z.literal("notification"),
          description: text,
        }),
      ),
    }),
  ),
  rules: z.array(
    z.strictObject({
      id,
      kind: z.enum(["precondition", "postcondition", "invariant"]),
      description: text,
      scope: z.strictObject({ kind: z.enum(["entity", "relationship"]), id }),
    }),
  ),
  constraints: z.array(
    z.strictObject({
      id,
      ...description,
      kind: z.literal("unique"),
      entity: id,
      fields: z.array(id).min(1),
    }),
  ),
});
export type Contract = z.infer<typeof contractSchema>;
export type Field = z.infer<typeof fieldSchema>;
