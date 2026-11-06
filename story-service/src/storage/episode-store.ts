import { CreativeEpisodeStore as FileEpisodeStore } from "../../vendor/core/src/harness/episode-store.js";
import {
  CreativeEpisodeSchema,
  CreativeEpisodeEventSchema,
  EpisodeStatusSchema,
  HarnessIdSchema,
  WorkResourceIdSchema,
  HARNESS_VERSION,
  type CreativeEpisode,
  type CreativeEpisodeEvent,
  type EpisodeStatus,
} from "../../vendor/core/src/harness/contracts.js";
import { databasePath, enabled, storageSync } from "./client.js";
export class CreativeEpisodeStore {
  private namespace: string;
  constructor(path: string) {
    this.namespace = path;
    if (!enabled)
      return new FileEpisodeStore(path) as unknown as CreativeEpisodeStore;
    this.namespace = databasePath(path);
    storageSync("records.ensure", { namespace: this.namespace });
  }
  create(input: CreativeEpisode) {
    const episode = CreativeEpisodeSchema.parse(input);
    storageSync("records.create", {
      namespace: this.namespace,
      record: {
        kind: "episode",
        id: episode.id,
        work: episode.workId,
        sort: episode.startedAt,
        data: { ...episode, ownerPid: process.pid },
      },
    });
    return episode;
  }
  append(
    input: Omit<CreativeEpisodeEvent, "version" | "seq" | "timestamp">,
    timestamp = new Date().toISOString(),
  ): CreativeEpisodeEvent {
    const event = CreativeEpisodeEventSchema.parse({
      version: HARNESS_VERSION,
      ...input,
      seq: 0,
      timestamp,
    });
    return CreativeEpisodeEventSchema.parse(
      storageSync("episode.append", { namespace: this.namespace, event }),
    );
  }
  finish(
    id: string,
    status: Exclude<EpisodeStatus, "running">,
    completedAt = new Date().toISOString(),
  ): CreativeEpisode {
    HarnessIdSchema.parse(id);
    EpisodeStatusSchema.parse(status);
    if ((status as string) === "running")
      throw new Error("Episode must finish in a terminal state");
    return this.clean(
      storageSync("episode.finish", {
        namespace: this.namespace,
        id,
        status,
        completedAt,
      }),
    );
  }
  private clean(data: any): CreativeEpisode {
    const { ownerPid, ...episode } = data;
    return CreativeEpisodeSchema.parse(episode);
  }
  getEpisode(id: string): CreativeEpisode | undefined {
    HarnessIdSchema.parse(id);
    const row = storageSync("records.get", {
      namespace: this.namespace,
      kind: "episode",
      id,
    });
    return row ? this.clean(row) : undefined;
  }
  requireEpisode(id: string): CreativeEpisode {
    const episode = this.getEpisode(id);
    if (!episode) throw new Error(`Unknown creative episode: ${id}`);
    return episode;
  }
  bindWork(
    id: string,
    workId: string,
    timestamp = new Date().toISOString(),
  ): CreativeEpisode {
    HarnessIdSchema.parse(id);
    WorkResourceIdSchema.parse(workId);
    return this.clean(
      storageSync("episode.bind", {
        namespace: this.namespace,
        id,
        workId,
        timestamp,
      }),
    );
  }
  listEpisodes(
    options: {
      workId?: string;
      profileId?: string;
      status?: EpisodeStatus;
      limit?: number;
    } = {},
  ): CreativeEpisode[] {
    if (options.workId) WorkResourceIdSchema.parse(options.workId);
    if (options.profileId) HarnessIdSchema.parse(options.profileId);
    if (options.status) EpisodeStatusSchema.parse(options.status);
    return storageSync<any[]>("episode.list", {
      namespace: this.namespace,
      ...options,
      limit: Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100))),
    }).map((row) => this.clean(row));
  }
  listEvents(episodeId: string): CreativeEpisodeEvent[] {
    HarnessIdSchema.parse(episodeId);
    return storageSync<any[]>("records.list", {
      namespace: this.namespace,
      kind: "episode-event",
      parent: episodeId,
    })
      .map((row) => CreativeEpisodeEventSchema.parse(row.data))
      .sort((a, b) => a.seq - b.seq);
  }
  recoverInterruptedEpisodes(
    completedAt = new Date().toISOString(),
    reason = "studio-process-restarted",
  ) {
    const rows = storageSync<any[]>("records.list", {
      namespace: this.namespace,
      kind: "episode",
      filter: { status: "running" },
    });
    let recovered = 0;
    for (const { data } of rows) {
      if (data.ownerPid) {
        try {
          process.kill(data.ownerPid, 0);
          continue;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
        }
      }
      storageSync("episode.recover", {
        namespace: this.namespace,
        id: data.id,
        completedAt,
        reason,
      });
      recovered++;
    }
    return recovered;
  }
  close() {}
}
