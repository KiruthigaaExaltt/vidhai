import { z } from "zod/v4";

export type FieldKind = "number" | "decimal" | "string" | "boolean" | "date";
export type Field = {
  name: string; sourceName: string; kind: FieldKind; required: boolean; uniqueValue: boolean;
  defaultValue?: unknown; table?: MongoTable;
  reference?: () => Field; onDelete?: string;
  notNull(): Field; primaryKey(): Field; unique(): Field;
  default(value: unknown): Field; defaultNow(): Field; references(...args: unknown[]): Field;
};
export type MongoTable = Record<string, Field> & { $name: string; $inferSelect: Record<string, unknown> };

function field(name: string, kind: FieldKind): Field {
  const value: Field = {
    name, sourceName: name, kind, required: false, uniqueValue: false,
    notNull() { this.required = true; return this; },
    primaryKey() { this.required = true; this.uniqueValue = true; return this; },
    unique() { this.uniqueValue = true; return this; },
    default(v) { this.defaultValue = v; return this; },
    defaultNow() { this.defaultValue = () => new Date(); return this; },
    references(target: unknown, options?: unknown) { this.reference = target as () => Field; this.onDelete = (options as any)?.onDelete; return this; },
  };
  return value;
}

export const serial = (name: string) => field(name, "number");
export const integer = (name: string) => field(name, "number");
export const numeric = (name: string, _options?: unknown) => field(name, "decimal");
export const text = (name: string) => field(name, "string");
export const boolean = (name: string) => field(name, "boolean");
export const timestamp = (name: string, _options?: unknown) => field(name, "date");
export const date = (name: string, _options?: unknown) => field(name, "string");

export function mongoTable(name: string, fields: Record<string, Field>): MongoTable {
  const table = fields as MongoTable;
  Object.defineProperty(table, "$name", { value: name, enumerable: false });
  Object.defineProperty(table, "$inferSelect", { value: {}, enumerable: false });
  for (const [property, descriptor] of Object.entries(fields)) {
    descriptor.name = property;
    descriptor.table = table;
  }
  return registerMongoTable(table);
}

const registeredTables: MongoTable[] = [];
export function registerMongoTable(table: MongoTable) { registeredTables.push(table); return table; }
export function listMongoTables() { return [...registeredTables]; }

export function createInsertSchema(table: MongoTable) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, value] of Object.entries(table).filter(([, v]) => typeof v === "object")) {
    const f = value as Field;
    let validator: z.ZodTypeAny = f.kind === "number" ? z.number() : f.kind === "boolean" ? z.boolean() : f.kind === "date" ? z.coerce.date() : z.string();
    if (!f.required || f.defaultValue !== undefined) validator = validator.nullish();
    shape[name] = validator;
  }
  return z.object(shape);
}
