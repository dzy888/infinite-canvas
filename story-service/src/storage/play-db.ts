import { join } from "node:path";
import {
  PlayDB as FilePlayDB,
  type PlayGraphSnapshot,
} from "../../vendor/core/src/play/play-db.js";
import {
  PlayEntitySchema,
  PlayEdgeSchema,
  PlayStateSlotSchema,
  PlayEventSchema,
  type PlayEntity,
  type PlayEntityInput,
  type PlayEdge,
  type PlayEdgeInput,
  type PlayStateSlot,
  type PlayStateSlotInput,
  type PlayEvent,
  type PlayEventInput,
} from "../../vendor/core/src/models/play.js";
import { enabled, databasePath, storageSync } from "./client.js";
export type { PlayGraphSnapshot };
export class PlayDB {
  private namespace: string;
  private pending: Array<{
    kind: string;
    id: string;
    data: any;
    parent?: string;
    ordinal?: number;
  }> = [];
  private depth = 0;
  private replacement = false;
  constructor(runDir: string) {
    this.namespace = runDir;
    if (!enabled) return new FilePlayDB(runDir) as unknown as PlayDB;
    this.namespace = databasePath(join(runDir, "play.db"));
    storageSync("records.ensure", { namespace: this.namespace });
  }
  private list<T>(kind: string, query: Record<string, unknown> = {}): T[] {
    const stored = storageSync<any[]>("records.list", {
      namespace: this.namespace,
      kind,
      ...(this.depth ? {} : query),
    }).map((row) => row.data);
    const map = new Map(stored.map((row) => [row.id, row]));
    if (this.replacement) map.clear();
    for (const row of this.pending)
      if (row.kind === kind) map.set(row.id, row.data);
    return [...map.values()] as T[];
  }
  private get<T>(kind: string, id: string): T | null {
    const pending = this.pending.findLast(
      (row) => row.kind === kind && row.id === id,
    );
    return (
      pending?.data ??
      (this.replacement
        ? null
        : storageSync("records.get", { namespace: this.namespace, kind, id }))
    );
  }
  private put(kind: string, data: any, parent?: string, ordinal?: number) {
    this.pending.push({ kind, id: data.id, data, parent, ordinal });
    if (!this.depth) this.flush();
  }
  private flush() {
    storageSync("records.batch", {
      namespace: this.namespace,
      records: this.pending,
      replace: this.replacement,
    });
    this.pending = [];
    this.replacement = false;
  }
  upsertEntity(input: PlayEntityInput) {
    this.put("entity", PlayEntitySchema.parse(input));
  }
  getEntity(id: string) {
    return this.get<PlayEntity>("entity", id);
  }
  upsertEdge(input: PlayEdgeInput) {
    this.put("edge", PlayEdgeSchema.parse(input), input.fromId);
  }
  expireEdge(id: string, validUntilEventId: string) {
    const edge = this.get<PlayEdge>("edge", id);
    if (edge) this.upsertEdge({ ...edge, validUntilEventId });
  }
  getCurrentEdgesForEntity(id: string) {
    return this.list<PlayEdge>("edge", {
      filter: { validUntilEventId: null },
      filterAny: [{ fromId: id }, { toId: id }],
    })
      .filter(
        (edge) =>
          (edge.fromId === id || edge.toId === id) &&
          edge.validUntilEventId === null,
      )
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  }
  getEvidenceForClaim(id: string) {
    const edges = this.list<PlayEdge>("edge", {
      filter: { toId: id, type: "supports", validUntilEventId: null },
    })
      .filter(
        (edge) =>
          edge.toId === id &&
          edge.type === "supports" &&
          edge.validUntilEventId === null,
      )
      .sort(
        (a, b) =>
          (b.strength ?? 0) - (a.strength ?? 0) ||
          a.fromId.localeCompare(b.fromId),
      );
    const entities = new Map(
      this.list<PlayEntity>("entity", {
        ids: edges.map((edge) => edge.fromId),
      }).map((entity) => [entity.id, entity]),
    );
    return edges.flatMap((edge) => {
      const entity = entities.get(edge.fromId);
      return entity && ["evidence", "clue"].includes(entity.type)
        ? [entity]
        : [];
    });
  }
  upsertStateSlot(input: PlayStateSlotInput) {
    this.put(
      "state-slot",
      PlayStateSlotSchema.parse(input),
      input.ownerEntityId ?? undefined,
    );
  }
  getStateSlotsForEntity(id: string) {
    return this.list<PlayStateSlot>("state-slot", { parent: id })
      .filter((slot) => slot.ownerEntityId === id)
      .sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) ||
          a.label.localeCompare(b.label) ||
          a.id.localeCompare(b.id),
      );
  }
  recordEvent(input: PlayEventInput) {
    this.put("event", PlayEventSchema.parse(input), undefined, input.turn);
  }
  getEvent(id: string) {
    return this.get<PlayEvent>("event", id);
  }
  snapshot(): PlayGraphSnapshot {
    return {
      entities: this.list<PlayEntity>("entity").sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      edges: this.list<PlayEdge>("edge").sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      stateSlots: this.list<PlayStateSlot>("state-slot").sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      events: this.list<PlayEvent>("event").sort(
        (a, b) => a.turn - b.turn || a.id.localeCompare(b.id),
      ),
    };
  }
  replaceWithSnapshot(snapshot: PlayGraphSnapshot) {
    this.transaction(() => {
      this.replacement = true;
      for (const row of snapshot.entities) this.upsertEntity(row);
      for (const row of snapshot.edges) this.upsertEdge(row);
      for (const row of snapshot.stateSlots) this.upsertStateSlot(row);
      for (const row of snapshot.events) this.recordEvent(row);
    });
  }
  transaction<T>(action: () => T): T {
    const count = this.pending.length,
      replace = this.replacement,
      depth = this.depth;
    this.depth = depth + 1;
    try {
      const result = action();
      this.depth = depth;
      if (!this.depth) this.flush();
      return result;
    } catch (error) {
      this.depth = depth;
      this.pending.splice(count);
      this.replacement = replace;
      throw error;
    }
  }
  close() {}
}
