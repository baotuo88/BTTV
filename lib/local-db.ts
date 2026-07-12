import { promises as fs } from "fs";
import path from "path";
import { ObjectId } from "mongodb";
import { COLLECTIONS } from "@/lib/constants/db";

type LocalDocument = Record<string, unknown>;
type Filter = Record<string, unknown>;
type SortSpec = Record<string, 1 | -1>;
type Projection = Record<string, 0 | 1>;

const LOCAL_DB_NAME = "bttv-local";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !isObjectId(value)
  );
}

function isObjectId(value: unknown): value is ObjectId {
  return (
    typeof value === "object" &&
    value !== null &&
    "_bsontype" in value &&
    String((value as { _bsontype?: unknown })._bsontype).toLowerCase() ===
      "objectid"
  );
}

function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}

function normalizeComparable(value: unknown): unknown {
  if (isObjectId(value)) return value.toHexString();
  if (value instanceof Date) return value.getTime();
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeComparable(left);
  const normalizedRight = normalizeComparable(right);
  return normalizedLeft === normalizedRight;
}

function compareValues(left: unknown, right: unknown): number {
  const normalizedLeft = normalizeComparable(left);
  const normalizedRight = normalizeComparable(right);

  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    return normalizedLeft - normalizedRight;
  }

  return String(normalizedLeft ?? "").localeCompare(String(normalizedRight ?? ""));
}

function getByPath(doc: LocalDocument, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!isPlainObject(current)) return undefined;
    return current[part];
  }, doc);
}

function setByPath(doc: LocalDocument, key: string, value: unknown) {
  const parts = key.split(".");
  let target: LocalDocument = doc;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(target[part])) {
      target[part] = {};
    }
    target = target[part] as LocalDocument;
  }
  target[parts[parts.length - 1]] = value;
}

function unsetByPath(doc: LocalDocument, key: string) {
  const parts = key.split(".");
  let target: LocalDocument = doc;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(target[part])) return;
    target = target[part] as LocalDocument;
  }
  delete target[parts[parts.length - 1]];
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).some((key) => key.startsWith("$"));
}

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (!isOperatorObject(condition)) {
    return valuesEqual(value, condition);
  }

  for (const [operator, expected] of Object.entries(condition)) {
    if (operator === "$in") {
      if (!Array.isArray(expected) || !expected.some((item) => valuesEqual(value, item))) {
        return false;
      }
    } else if (operator === "$nin") {
      if (Array.isArray(expected) && expected.some((item) => valuesEqual(value, item))) {
        return false;
      }
    } else if (operator === "$ne") {
      if (valuesEqual(value, expected)) {
        return false;
      }
    } else if (operator === "$gt") {
      if (compareValues(value, expected) <= 0) {
        return false;
      }
    } else if (operator === "$gte") {
      if (compareValues(value, expected) < 0) {
        return false;
      }
    } else if (operator === "$regex") {
      const options =
        typeof condition.$options === "string" ? condition.$options : undefined;
      const regex = new RegExp(String(expected), options);
      if (!regex.test(String(value ?? ""))) {
        return false;
      }
    }
  }

  return true;
}

function matchesFilter(doc: LocalDocument, filter: Filter = {}): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or") {
      if (
        !Array.isArray(condition) ||
        !condition.some((item) => matchesFilter(doc, item as Filter))
      ) {
        return false;
      }
      continue;
    }

    if (!matchesCondition(getByPath(doc, key), condition)) {
      return false;
    }
  }

  return true;
}

function serializeValue(value: unknown): unknown {
  if (isObjectId(value)) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)])
    );
  }
  return value;
}

function reviveValue(collectionName: string, key: string, value: unknown): unknown {
  if (
    (key === "_id" || key === "user_id") &&
    isObjectIdString(value) &&
    ObjectId.isValid(value)
  ) {
    return new ObjectId(value);
  }

  if (key === "expires_at" && typeof value === "string") {
    return new Date(value);
  }

  if (
    key === "updatedAt" &&
    typeof value === "string" &&
    (collectionName === COLLECTIONS.SITE_CONFIG ||
      collectionName === COLLECTIONS.OPERATIONS_CONFIG)
  ) {
    return new Date(value);
  }

  if (Array.isArray(value)) return value.map((item) => reviveValue(collectionName, key, item));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, item]) => [
        childKey,
        reviveValue(collectionName, childKey, item),
      ])
    );
  }
  return value;
}

function cloneForReturn<T extends LocalDocument>(
  collectionName: string,
  doc: LocalDocument
): T {
  const serialized = serializeValue(doc) as LocalDocument;
  return reviveValue(collectionName, "", serialized) as T;
}

function projectDoc<T extends LocalDocument>(doc: T, projection?: Projection): T {
  if (!projection || Object.keys(projection).length === 0) return doc;

  const includeKeys = Object.entries(projection)
    .filter(([, value]) => value === 1)
    .map(([key]) => key);

  if (includeKeys.length === 0) return doc;

  const projected: LocalDocument = {};
  for (const key of includeKeys) {
    const value = getByPath(doc, key);
    if (value !== undefined) setByPath(projected, key, value);
  }
  if (projection._id !== 0 && doc._id !== undefined) {
    projected._id = doc._id;
  }

  return projected as T;
}

function applySort<T extends LocalDocument>(docs: T[], sort?: SortSpec): T[] {
  if (!sort || Object.keys(sort).length === 0) return docs;

  return [...docs].sort((left, right) => {
    for (const [key, direction] of Object.entries(sort)) {
      const comparison = compareValues(getByPath(left, key), getByPath(right, key));
      if (comparison !== 0) return direction === -1 ? -comparison : comparison;
    }
    return 0;
  });
}

function extractInsertFieldsFromFilter(filter: Filter): LocalDocument {
  const doc: LocalDocument = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$") || isOperatorObject(value)) continue;
    setByPath(doc, key, value);
  }
  return doc;
}

function applyUpdate(doc: LocalDocument, update: LocalDocument, isInsert: boolean) {
  const hasOperators = Object.keys(update).some((key) => key.startsWith("$"));

  if (!hasOperators) {
    for (const key of Object.keys(doc)) delete doc[key];
    Object.assign(doc, update);
    return;
  }

  const setValues = (update.$set || {}) as LocalDocument;
  for (const [key, value] of Object.entries(setValues)) {
    setByPath(doc, key, value);
  }

  if (isInsert) {
    const setOnInsertValues = (update.$setOnInsert || {}) as LocalDocument;
    for (const [key, value] of Object.entries(setOnInsertValues)) {
      setByPath(doc, key, value);
    }
  }

  const unsetValues = (update.$unset || {}) as LocalDocument;
  for (const key of Object.keys(unsetValues)) {
    unsetByPath(doc, key);
  }

  const incValues = (update.$inc || {}) as Record<string, number>;
  for (const [key, value] of Object.entries(incValues)) {
    const current = Number(getByPath(doc, key) || 0);
    setByPath(doc, key, current + value);
  }
}

function ensureDocumentId(doc: LocalDocument): unknown {
  if (doc._id === undefined || doc._id === null) {
    doc._id = new ObjectId();
  }
  return doc._id;
}

function collectionFileName(collectionName: string): string {
  return `${collectionName.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

export function getLocalDataDir(): string {
  return path.resolve(process.env.LOCAL_DATA_DIR || path.join(process.cwd(), "data"));
}

export class LocalDb {
  readonly databaseName = LOCAL_DB_NAME;
  private collections = new Map<string, LocalCollection>();

  collection<T extends LocalDocument = LocalDocument>(name: string): LocalCollection<T> {
    const existing = this.collections.get(name);
    if (existing) return existing as LocalCollection<T>;

    const collection = new LocalCollection<T>(name, getLocalDataDir());
    this.collections.set(name, collection as LocalCollection);
    return collection;
  }

  admin() {
    return {
      ping: async () => {
        await fs.mkdir(getLocalDataDir(), { recursive: true });
        return { ok: 1 };
      },
    };
  }

  listCollections() {
    return {
      toArray: async () => {
        await fs.mkdir(getLocalDataDir(), { recursive: true });
        const files = await fs.readdir(getLocalDataDir()).catch(() => []);
        const fileCollections = files
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.slice(0, -5));
        const knownCollections = Object.values(COLLECTIONS);
        return Array.from(new Set([...knownCollections, ...fileCollections])).map((name) => ({
          name,
        }));
      },
    };
  }
}

export class LocalCollection<T extends LocalDocument = LocalDocument> {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly name: string,
    private readonly dataDir: string
  ) {}

  private get filePath() {
    return path.join(this.dataDir, collectionFileName(this.name));
  }

  private async withLock<R>(task: () => Promise<R>): Promise<R> {
    const previous = this.queue;
    let release = () => {};
    this.queue = previous.then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );

    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  private async readDocs(): Promise<T[]> {
    await fs.mkdir(this.dataDir, { recursive: true });

    let raw = "[]";
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parsed = JSON.parse(raw) as LocalDocument[];
    if (!Array.isArray(parsed)) {
      throw new Error(`本地集合文件格式错误: ${this.filePath}`);
    }

    return parsed.map((doc) => reviveValue(this.name, "", doc) as T);
  }

  private async writeDocs(docs: T[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    const serialized = JSON.stringify(docs.map(serializeValue), null, 2);
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, serialized, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }

  private async runRead<R>(task: (docs: T[]) => R | Promise<R>): Promise<R> {
    return this.withLock(async () => task(await this.readDocs()));
  }

  private async runWrite<R>(task: (docs: T[]) => R | Promise<R>): Promise<R> {
    return this.withLock(async () => {
      const docs = await this.readDocs();
      const result = await task(docs);
      await this.writeDocs(docs);
      return result;
    });
  }

  async createIndex() {
    return "local_index";
  }

  find(filter: Filter = {}, options?: { projection?: Projection }) {
    return new LocalQuery<T>(this, filter, options?.projection);
  }

  async findOne(
    filter: Filter = {},
    options?: { sort?: SortSpec; projection?: Projection }
  ): Promise<T | null> {
    let query = this.find(filter, { projection: options?.projection });
    if (options?.sort) query = query.sort(options.sort);
    const docs = await query.limit(1).toArray();
    return docs[0] || null;
  }

  async insertOne(doc: T): Promise<{ insertedId: unknown }> {
    const inserted = await this.runWrite(async (docs) => {
      const nextDoc = cloneForReturn<T>(this.name, doc);
      const insertedId = ensureDocumentId(nextDoc);
      docs.push(nextDoc);
      (doc as LocalDocument)._id = insertedId;
      return insertedId;
    });

    return { insertedId: inserted };
  }

  async updateOne(
    filter: Filter,
    update: LocalDocument,
    options?: { upsert?: boolean }
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: unknown }> {
    return this.runWrite(async (docs) => {
      const index = docs.findIndex((doc) => matchesFilter(doc, filter));

      if (index >= 0) {
        applyUpdate(docs[index], update, false);
        return { matchedCount: 1, modifiedCount: 1 };
      }

      if (!options?.upsert) {
        return { matchedCount: 0, modifiedCount: 0 };
      }

      const nextDoc = extractInsertFieldsFromFilter(filter) as T;
      applyUpdate(nextDoc, update, true);
      const upsertedId = ensureDocumentId(nextDoc);
      docs.push(nextDoc);
      return { matchedCount: 0, modifiedCount: 0, upsertedId };
    });
  }

  async updateMany(
    filter: Filter,
    update: LocalDocument
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.runWrite(async (docs) => {
      let matchedCount = 0;
      for (const doc of docs) {
        if (matchesFilter(doc, filter)) {
          applyUpdate(doc, update, false);
          matchedCount += 1;
        }
      }
      return { matchedCount, modifiedCount: matchedCount };
    });
  }

  async findOneAndUpdate(
    filter: Filter,
    update: LocalDocument,
    options?: { returnDocument?: "before" | "after"; upsert?: boolean }
  ): Promise<T | null> {
    return this.runWrite(async (docs) => {
      let index = docs.findIndex((doc) => matchesFilter(doc, filter));
      let inserted = false;

      if (index < 0) {
        if (!options?.upsert) return null;
        const nextDoc = extractInsertFieldsFromFilter(filter) as T;
        ensureDocumentId(nextDoc);
        docs.push(nextDoc);
        index = docs.length - 1;
        inserted = true;
      }

      const before = cloneForReturn<T>(this.name, docs[index]);
      applyUpdate(docs[index], update, inserted);
      const after = cloneForReturn<T>(this.name, docs[index]);
      return options?.returnDocument === "before" ? before : after;
    });
  }

  async deleteOne(filter: Filter): Promise<{ deletedCount: number }> {
    return this.runWrite(async (docs) => {
      const index = docs.findIndex((doc) => matchesFilter(doc, filter));
      if (index < 0) return { deletedCount: 0 };
      docs.splice(index, 1);
      return { deletedCount: 1 };
    });
  }

  async deleteMany(filter: Filter = {}): Promise<{ deletedCount: number }> {
    return this.runWrite(async (docs) => {
      let deletedCount = 0;
      for (let index = docs.length - 1; index >= 0; index -= 1) {
        if (matchesFilter(docs[index], filter)) {
          docs.splice(index, 1);
          deletedCount += 1;
        }
      }
      return { deletedCount };
    });
  }

  async bulkWrite(operations: LocalDocument[]): Promise<{ ok: 1 }> {
    for (const operation of operations) {
      if (isPlainObject(operation.updateOne)) {
        const updateOne = operation.updateOne as {
          filter: Filter;
          update: LocalDocument;
          upsert?: boolean;
        };
        await this.updateOne(updateOne.filter, updateOne.update, {
          upsert: updateOne.upsert,
        });
      } else if (isPlainObject(operation.deleteOne)) {
        const deleteOne = operation.deleteOne as { filter: Filter };
        await this.deleteOne(deleteOne.filter);
      }
    }
    return { ok: 1 };
  }

  aggregate<R extends LocalDocument = LocalDocument>(pipeline: LocalDocument[]) {
    return {
      toArray: async (): Promise<R[]> => {
        return this.runRead(async (docs) => {
          let results: LocalDocument[] = [...docs];

          for (const stage of pipeline) {
            if (isPlainObject(stage.$match)) {
              results = results.filter((doc) => matchesFilter(doc, stage.$match as Filter));
            } else if (isPlainObject(stage.$group)) {
              const group = stage.$group as LocalDocument;
              const idExpression = group._id;
              const idField =
                typeof idExpression === "string" && idExpression.startsWith("$")
                  ? idExpression.slice(1)
                  : "";
              const grouped = new Map<string, LocalDocument>();

              for (const doc of results) {
                const id = idField ? getByPath(doc, idField) : idExpression;
                const key = String(normalizeComparable(id));
                const current = grouped.get(key) || { _id: id, count: 0 };
                current.count = Number(current.count || 0) + 1;
                grouped.set(key, current);
              }

              results = Array.from(grouped.values());
            }
          }

          return results.map((doc) => cloneForReturn<R>(this.name, doc));
        });
      },
    };
  }

  async countDocuments(filter: Filter = {}): Promise<number> {
    return this.runRead((docs) => docs.filter((doc) => matchesFilter(doc, filter)).length);
  }

  async query(
    filter: Filter,
    sort?: SortSpec,
    limitCount?: number,
    projection?: Projection
  ): Promise<T[]> {
    return this.runRead((docs) => {
      const matched = docs.filter((doc) => matchesFilter(doc, filter));
      const sorted = applySort(matched, sort);
      const limited =
        limitCount !== undefined && limitCount >= 0 ? sorted.slice(0, limitCount) : sorted;
      return limited.map((doc) =>
        projectDoc(cloneForReturn<T>(this.name, doc), projection)
      );
    });
  }
}

class LocalQuery<T extends LocalDocument = LocalDocument> {
  private sortSpec?: SortSpec;
  private limitCount?: number;
  private projection?: Projection;

  constructor(
    private readonly collection: LocalCollection<T>,
    private readonly filter: Filter,
    projection?: Projection
  ) {
    this.projection = projection;
  }

  sort(sort: SortSpec) {
    this.sortSpec = sort;
    return this;
  }

  limit(limit: number) {
    this.limitCount = limit;
    return this;
  }

  project<R extends LocalDocument = T>(projection: Projection): LocalQuery<R> {
    this.projection = projection;
    return this as unknown as LocalQuery<R>;
  }

  async toArray(): Promise<T[]> {
    return this.collection.query(
      this.filter,
      this.sortSpec,
      this.limitCount,
      this.projection
    );
  }
}

let localDb: LocalDb | undefined;

export function getLocalDatabase(): LocalDb {
  if (!localDb) {
    localDb = new LocalDb();
  }
  return localDb;
}
