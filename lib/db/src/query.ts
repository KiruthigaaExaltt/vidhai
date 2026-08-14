import mongoose, { Schema, type ClientSession, type Model } from "mongoose";
import { listMongoTables, type Field, type MongoTable } from "./schema/dsl";

export type Condition = {
  op: string;
  field?: Field;
  value?: unknown;
  children?: Condition[];
};
export type Order = { field: Field; direction: 1 | -1 };
export interface Query extends PromiseLike<Record<string, any>[]> {
  innerJoin(t: MongoTable, c: Condition): Query;
  leftJoin(t: MongoTable, c: Condition): Query;
  where(c: Condition): Query;
  orderBy(...o: (Order | Field)[]): Query;
  offset(n: number): Query;
  limit(n: number): Query;
  $dynamic(): Query;
}
export interface MutationQuery extends PromiseLike<Record<string, any>[]> {
  values(v: any): MutationQuery;
  set(v: any): MutationQuery;
  where(c: Condition): MutationQuery;
  returning(): MutationQuery;
}
type Selection = Field | MongoTable;
export interface Database {
  select(p?: Record<string, Selection>): { from(t: MongoTable): Query };
  count(t: MongoTable, c?: Condition): Promise<number>;
  insert(t: MongoTable): MutationQuery;
  update(t: MongoTable): MutationQuery;
  delete(t: MongoTable): MutationQuery;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}
export const eq = (field: Field, value: unknown): Condition => ({
  op: "eq",
  field,
  value,
});
export const gte = (field: Field, value: unknown): Condition => ({
  op: "gte",
  field,
  value,
});
export const lte = (field: Field, value: unknown): Condition => ({
  op: "lte",
  field,
  value,
});
export const ilike = (field: Field, value: unknown): Condition => ({
  op: "ilike",
  field,
  value,
});
export const inArray = (field: Field, value: unknown[]): Condition => ({
  op: "in",
  field,
  value,
});
export const isNull = (field: Field): Condition => ({ op: "null", field });
export const and = (...children: (Condition | undefined)[]): Condition => ({
  op: "and",
  children: children.filter(Boolean) as Condition[],
});
export const or = (...children: (Condition | undefined)[]): Condition => ({
  op: "or",
  children: children.filter(Boolean) as Condition[],
});
export const desc = (field: Field): Order => ({ field, direction: -1 });
export const asc = (field: Field): Order => ({ field, direction: 1 });

const models = new Map<string, Model<any>>();
const numericString = {
  type: Schema.Types.Decimal128,
  get: (v: any) => (v == null ? v : v.toString()),
  set: (v: any) =>
    v == null ? v : mongoose.Types.Decimal128.fromString(String(v)),
};

export function modelFor(table: MongoTable) {
  const existing = models.get(table.$name);
  if (existing) return existing;
  const definition: Record<string, any> = {};
  for (const [name, value] of Object.entries(table).filter(
    ([, v]) => typeof v === "object",
  )) {
    const f = value as Field;
    const spec: any =
      f.kind === "decimal"
        ? { ...numericString }
        : {
            type:
              f.kind === "number"
                ? Number
                : f.kind === "boolean"
                  ? Boolean
                  : f.kind === "date"
                    ? Date
                    : f.kind === "json"
                      ? Schema.Types.Mixed
                      : String,
          };
    spec.required = f.required;
    spec.unique = f.uniqueValue;
    if (f.defaultValue !== undefined) spec.default = f.defaultValue;
    definition[name] = spec;
  }
  const schema = new Schema(definition, {
    collection: table.$name,
    versionKey: false,
    id: false,
    toObject: { getters: true },
    toJSON: { getters: true },
  });
  const frequentlyQueried = new Set([
    "status",
    "createdAt",
    "recordedAt",
    "enteredAt",
    "plannedDate",
    "transactionDate",
    "harvestDate",
    "usageDate",
    "fuelDate",
    "batchCode",
    "locationCode",
    "planCode",
  ]);
  for (const [name, value] of Object.entries(table)) {
    const f = value as Field;
    if ((f.reference || frequentlyQueried.has(name)) && !f.uniqueValue)
      schema.index({ [name]: 1 });
  }
  schema.pre("validate", async function () {
    for (const [name, value] of Object.entries(table)) {
      const f = value as Field,
        id = (this as any)[name];
      if (!f.reference || id == null) continue;
      const target = f.reference();
      if (
        !(await modelFor(target.table!)
          .exists({ [target.name]: id })
          .session((this as any).$session()))
      ) {
        const error = new mongoose.Error.ValidationError();
        error.addError(
          name,
          new mongoose.Error.ValidatorError({
            path: name,
            value: id,
            message: `Invalid reference ${table.$name}.${name}`,
          }),
        );
        throw error;
      }
    }
  });
  const model =
    mongoose.models[`Vidhai_${table.$name}`] ||
    mongoose.model(`Vidhai_${table.$name}`, schema);
  models.set(table.$name, model);
  return model;
}

export async function syncTableIndexes(table: MongoTable) {
  await connectMongo();
  await modelFor(table).syncIndexes();
}
export async function syncTableCustomIndexes(
  table: MongoTable,
  indexes: Array<{
    key: Record<string, 1 | -1>;
    name: string;
    unique?: boolean;
    expireAfterSeconds?: number;
  }>,
) {
  await connectMongo();
  await modelFor(table).collection.createIndexes(indexes as any);
}

async function nextId(table: MongoTable, session?: ClientSession) {
  const Counter =
    mongoose.models.Vidhai_Counter ||
    mongoose.model(
      "Vidhai_Counter",
      new Schema(
        { _id: String, value: Number },
        { collection: "_counters", versionKey: false },
      ),
    );
  const row = await Counter.findOneAndUpdate(
    { _id: table.$name },
    { $inc: { value: 1 } },
    { upsert: true, new: true, session },
  ).lean();
  return (row as any).value;
}
function mongoFilter(condition?: Condition, table?: MongoTable): any {
  if (!condition) return {};
  if (condition.op === "and")
    return { $and: condition.children!.map((c) => mongoFilter(c, table)) };
  if (condition.op === "or")
    return { $or: condition.children!.map((c) => mongoFilter(c, table)) };
  if (condition.field?.table !== table) return {};
  const key = condition.field!.name;
  if (
    condition.value &&
    typeof condition.value === "object" &&
    "table" in (condition.value as object)
  )
    return {};
  if (condition.op === "eq") return { [key]: condition.value };
  if (condition.op === "gte") return { [key]: { $gte: condition.value } };
  if (condition.op === "lte") return { [key]: { $lte: condition.value } };
  if (condition.op === "in") return { [key]: { $in: condition.value } };
  if (condition.op === "null") return { [key]: null };
  if (condition.op === "ilike")
    return {
      [key]: {
        $regex: String(condition.value).replace(/%/g, ".*"),
        $options: "i",
      },
    };
  return {};
}
function matches(row: Record<string, any>, c?: Condition): boolean {
  if (!c) return true;
  if (c.op === "and") return c.children!.every((x) => matches(row, x));
  if (c.op === "or") return c.children!.some((x) => matches(row, x));
  const v = row[`${c.field!.table!.$name}.${c.field!.name}`];
  const expected =
    c.value && typeof c.value === "object" && "table" in (c.value as object)
      ? row[`${(c.value as Field).table!.$name}.${(c.value as Field).name}`]
      : c.value;
  if (c.op === "eq") return v === expected;
  if (c.op === "gte") return v >= expected!;
  if (c.op === "lte") return v <= expected!;
  if (c.op === "in") return (c.value as unknown[]).includes(v);
  if (c.op === "null") return v == null;
  if (c.op === "ilike")
    return new RegExp(String(c.value).replace(/%/g, ".*"), "i").test(String(v));
  return true;
}
function plain(doc: any) {
  const obj = doc?.toObject ? doc.toObject({ getters: true }) : doc;
  if (obj) delete obj._id;
  return obj;
}

class SelectQuery implements PromiseLike<any[]> {
  private joins: { table: MongoTable; condition: Condition; left: boolean }[] =
    [];
  private condition?: Condition;
  private orders: Order[] = [];
  private start = 0;
  private max?: number;
  constructor(
    private projection: Record<string, Selection> | undefined,
    private table: MongoTable,
    private session?: ClientSession,
  ) {}
  innerJoin(t: MongoTable, c: Condition) {
    this.joins.push({ table: t, condition: c, left: false });
    return this;
  }
  leftJoin(t: MongoTable, c: Condition) {
    this.joins.push({ table: t, condition: c, left: true });
    return this;
  }
  where(c: Condition) {
    this.condition = this.condition ? and(this.condition, c) : c;
    return this;
  }
  orderBy(...orders: (Order | Field)[]) {
    this.orders.push(
      ...orders.map((o) =>
        "direction" in o ? o : { field: o, direction: 1 as const },
      ),
    );
    return this;
  }
  offset(n: number) {
    this.start = Math.max(0, n);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  $dynamic() {
    return this;
  }
  async run() {
    let base = await modelFor(this.table)
      .find(mongoFilter(this.condition, this.table))
      .session(this.session || null)
      .lean({ getters: true });
    let rows = base.map((d) =>
      Object.fromEntries(
        Object.entries(plain(d)).map(([k, v]) => [
          `${this.table.$name}.${k}`,
          v,
        ]),
      ),
    );
    for (const join of this.joins) {
      const docs = (
        await modelFor(join.table)
          .find({})
          .session(this.session || null)
          .lean({ getters: true })
      ).map(plain);
      rows = rows.flatMap((row) => {
        const found = docs.filter((doc) =>
          matches(
            {
              ...row,
              ...Object.fromEntries(
                Object.entries(doc).map(([k, v]) => [
                  `${join.table.$name}.${k}`,
                  v,
                ]),
              ),
            },
            join.condition,
          ),
        );
        const use = found.length ? found : join.left ? [null] : [];
        return use.map((doc) => ({
          ...row,
          ...(doc
            ? Object.fromEntries(
                Object.entries(doc).map(([k, v]) => [
                  `${join.table.$name}.${k}`,
                  v,
                ]),
              )
            : {}),
        }));
      });
    }
    rows = rows.filter((r) => matches(r, this.condition));
    for (const order of [...this.orders].reverse())
      rows.sort((a, b) => {
        const av: any = a[`${order.field.table!.$name}.${order.field.name}`],
          bv: any = b[`${order.field.table!.$name}.${order.field.name}`];
        return (av < bv ? -1 : av > bv ? 1 : 0) * order.direction;
      });
    if (this.start || this.max != null)
      rows = rows.slice(
        this.start,
        this.max == null ? undefined : this.start + this.max,
      );
    return rows.map((row) =>
      this.projection
        ? Object.fromEntries(
            Object.entries(this.projection).map(([k, f]) => {
              if ("$name" in f) {
                const entries = Object.entries(row).filter(([key]) =>
                  key.startsWith(`${f.$name}.`),
                );
                return [
                  k,
                  entries.length
                    ? Object.fromEntries(
                        entries.map(([key, v]) => [
                          key.slice(f.$name.length + 1),
                          v,
                        ]),
                      )
                    : null,
                ];
              }
              return [k, row[`${f.table!.$name}.${f.name}`] ?? null];
            }),
          )
        : Object.fromEntries(
            Object.entries(row)
              .filter(([k]) => k.startsWith(`${this.table.$name}.`))
              .map(([k, v]) => [k.slice(this.table.$name.length + 1), v]),
          ),
    );
  }
  then<TResult1 = any[], TResult2 = never>(
    ok?: ((v: any[]) => TResult1 | PromiseLike<TResult1>) | null,
    bad?: ((e: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.run().then(ok, bad);
  }
}
class Mutation implements PromiseLike<any[]> {
  private data: any;
  private condition?: Condition;
  private wantsRows = false;
  constructor(
    private kind: "insert" | "update" | "delete",
    private table: MongoTable,
    private session?: ClientSession,
  ) {}
  values(v: any) {
    this.data = v;
    return this;
  }
  set(v: any) {
    this.data = v;
    return this;
  }
  where(c: Condition) {
    this.condition = c;
    return this;
  }
  returning() {
    this.wantsRows = true;
    return this;
  }
  async run() {
    const Model = modelFor(this.table),
      filter = mongoFilter(this.condition, this.table);
    if (this.kind === "insert") {
      const values = Array.isArray(this.data) ? this.data : [this.data];
      const out = [];
      for (const value of values) {
        const doc = {
          ...value,
          id: value.id ?? (await nextId(this.table, this.session)),
        };
        out.push(plain(await new Model(doc).save({ session: this.session })));
      }
      return out;
    }
    if (this.kind === "update") {
      if (!this.wantsRows) {
        await Model.updateMany(
          filter,
          { $set: this.data },
          { session: this.session, runValidators: true },
        );
        return [];
      }
      const result = await Model.findOneAndUpdate(
        filter,
        { $set: this.data },
        { new: true, session: this.session, runValidators: true },
      );
      return result ? [plain(result)] : [];
    }
    const doomed = await Model.find(filter, { id: 1 })
      .session(this.session || null)
      .lean();
    for (const row of doomed) {
      for (const child of listMongoTables()) {
        for (const [name, value] of Object.entries(child)) {
          const f = value as Field;
          if (f.onDelete === "cascade" && f.reference?.().table == this.table)
            await modelFor(child).deleteMany(
              { [name]: (row as any).id },
              { session: this.session },
            );
        }
      }
    }
    await Model.deleteMany(filter, { session: this.session });
    return [];
  }
  then<TResult1 = any[], TResult2 = never>(
    ok?: ((v: any[]) => TResult1 | PromiseLike<TResult1>) | null,
    bad?: ((e: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.run().then(ok, bad);
  }
}
export function createDatabase(session?: ClientSession): Database {
  return {
    select: (p?: Record<string, Selection>) => ({
      from: (t: MongoTable) => new SelectQuery(p, t, session),
    }),
    count: async (t: MongoTable, c?: Condition) =>
      modelFor(t)
        .countDocuments(mongoFilter(c, t))
        .session(session || null),
    insert: (t: MongoTable) => new Mutation("insert", t, session),
    update: (t: MongoTable) => new Mutation("update", t, session),
    delete: (t: MongoTable) => new Mutation("delete", t, session),
    transaction: async <T>(fn: (tx: Database) => Promise<T>) => {
      if (session) return fn(createDatabase(session));
      const s = await mongoose.startSession();
      try {
        let result!: T;
        await s.withTransaction(async () => {
          result = await fn(createDatabase(s));
        });
        return result;
      } finally {
        await s.endSession();
      }
    },
  };
}
export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(process.env.MONGODB_URI);
  return mongoose.connection;
}
