import { z } from "zod";
import { text as displayText } from "../../support/input/schema.js";
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const columns = z.array(id).min(1);
const key = z.strictObject({ id, columns });
const column = z.discriminatedUnion("type", [
  z.strictObject({ id, type: z.enum(["string", "integer", "boolean", "date", "datetime"]), nullable: z.boolean() }),
  z.strictObject({ id, type: z.literal("enum"), nullable: z.boolean(), values: z.array(displayText).min(1) }),
]);
export const databaseSchema = z.strictObject({
  apiVersion: z.literal("cca.dev/db-mapping/v1alpha1"),
  tables: z.array(z.strictObject({
    id, columns: z.array(column), primaryKey: key.nullable(), uniqueKeys: z.array(key),
    foreignKeys: z.array(z.strictObject({ id, columns, references: z.strictObject({ table: id, columns }) })),
  })),
  entities: z.array(z.strictObject({ entity: id, table: id, fields: z.array(z.strictObject({ field: id, column: id })) })),
  relationships: z.array(z.strictObject({ relationship: id, owner: z.enum(["from", "to"]), table: id, foreignKey: id })),
  constraints: z.array(z.strictObject({ constraint: id, table: id, key: id })),
});
export type DatabaseMapping = z.infer<typeof databaseSchema>;
