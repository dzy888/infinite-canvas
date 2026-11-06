import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Compatibility import for pre-presentation saves only. New saves never read the harness ledger. */
export async function legacyReceiptChoices(root: string, worldId: string, runId: string, turn: number, sceneText: string): Promise<string[] | null> {
  const path = join(root, ".inkos", "harness.sqlite");
  try { await stat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const db = process.env.DMX_STORY_STORAGE === "postgres" ? null : new DatabaseSync(path, { readOnly: true });
  try {
    if (db && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('creative_episode_events','creative_episodes')").all().length !== 2) return null;
    const snapshot = db ? null : JSON.parse(await readFile(path, "utf8"));
    const episodes = new Set(snapshot?.records.filter((row:any)=>row.kind === "episode" && row.data.workId === worldId).map((row:any)=>row.id));
    const rows = db ? db.prepare(`SELECT v.payload_json FROM creative_episode_events v
      JOIN creative_episodes e ON e.episode_id=v.episode_id
      WHERE e.work_id=? AND v.type='action-completed' AND v.action_id IN ('play_step','play_revise','play_start')
      ORDER BY v.timestamp DESC,v.seq DESC`).iterate(worldId) : snapshot.records.filter((row:any)=>row.kind === "episode-event" && episodes.has(row.data.episodeId) && row.data.type === "action-completed" && ["play_step","play_revise","play_start"].includes(row.data.actionId)).sort((a:any,b:any)=>b.data.timestamp.localeCompare(a.data.timestamp)||b.data.seq-a.data.seq).map((row:any)=>({payload_json:JSON.stringify(row.data.payload)}));
    for (const row of rows) {
      const data = JSON.parse(row.payload_json as string).result?.data;
      if (!data || (data.runId ?? "main") !== runId) continue;
      // Only the latest receipt for this run can describe its current render.
      if ((data.turn ?? data.currentState?.turn ?? (data.kind === "play_world_started" ? 0 : undefined)) !== turn
        || typeof data.sceneText !== "string" || data.sceneText.trim() !== sceneText.trim()
        || !Array.isArray(data.suggestedActions) || !data.suggestedActions.every((item: unknown) => typeof item === "string")) return null;
      return [...data.suggestedActions];
    }
    return null;
  } finally { db?.close(); }
}
