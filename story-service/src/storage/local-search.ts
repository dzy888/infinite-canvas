import { createHash } from "node:crypto";
import { databasePath, enabled, storageSync } from "./client.js";
import { LocalSearchIndex as FileSearchIndex } from "../../vendor/core/src/retrieval/local-search.js";

export interface SearchDocument {
  readonly id: string;
  readonly scope: string;
  readonly kind: string;
  readonly source: string;
  readonly title: string;
  readonly body: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchHit extends SearchDocument {
  readonly score: number;
}

export interface MarkdownSearchSegment {
  readonly heading: string;
  readonly body: string;
  readonly charStart: number;
  readonly charEnd: number;
}

/**
 * The single lexical retrieval kernel used by story memory, archived materials,
 * and Skill references. Source files remain authoritative; this database is a
 * rebuildable PostgreSQL full-text projection.
 */
export class LocalSearchIndex {
  private namespace: string;
  constructor(path: string) {
    this.namespace = path;
    if (!enabled)
      return new FileSearchIndex(path) as unknown as LocalSearchIndex;
    this.namespace = databasePath(path);
    storageSync("records.ensure", { namespace: this.namespace });
  }
  replaceScope(scope: string, documents: ReadonlyArray<SearchDocument>) {
    storageSync("search.replace", {
      namespace: this.namespace,
      scope,
      documents: documents.map((document) =>
        normalizeDocument(document, scope),
      ),
    });
  }
  search(
    query: string,
    options: { scope: string; kinds?: ReadonlyArray<string>; limit?: number },
  ): SearchHit[] {
    return storageSync("search.query", {
      namespace: this.namespace,
      scope: options.scope,
      kinds: options.kinds ?? [],
      tokens: [...new Set(tokenizeSearchText(query))],
      limit: Math.max(1, Math.min(200, Math.floor(options.limit ?? 24))),
    });
  }
  close() {}
}

export function splitMarkdownForSearch(
  markdown: string,
): MarkdownSearchSegment[] {
  const segments: MarkdownSearchSegment[] = [];
  let heading = "";
  const blockPattern = /(?:^|\n)([^\n](?:[\s\S]*?))(?=\n\s*\n|$)/g;
  for (const match of markdown.matchAll(blockPattern)) {
    const raw = match[1] ?? "";
    const leadingOffset = (match[0]?.length ?? raw.length) - raw.length;
    const charStart = (match.index ?? 0) + leadingOffset;
    const body = raw.trim();
    if (!body) continue;
    const headingMatch = body.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      heading = headingMatch[1]?.trim() ?? heading;
      continue;
    }
    segments.push({
      heading,
      body,
      charStart,
      charEnd: charStart + raw.length,
    });
  }
  return segments;
}

export function tokenizeSearchText(text: string): string[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const tokens: string[] = [];
  for (const part of segmenter.segment(normalized)) {
    const token = part.segment.trim();
    if (!part.isWordLike || !token) continue;
    if (/^[\p{Script=Latin}\p{N}_-]+$/u.test(token) && token.length < 2)
      continue;
    tokens.push(token);
  }
  // ICU can segment short Chinese compounds into individual Han characters.
  // Adjacent Han bigrams preserve those compounds for lexical retrieval; this
  // is tokenizer mechanics, not a semantic intent rule.
  const segmentedTokenCount = tokens.length;
  for (let index = 0; index < segmentedTokenCount - 1; index += 1) {
    const left = tokens[index] ?? "";
    const right = tokens[index + 1] ?? "";
    if (/^\p{Script=Han}$/u.test(left) && /^\p{Script=Han}$/u.test(right)) {
      tokens.push(`${left}${right}`);
    }
  }
  for (const match of normalized.matchAll(
    /[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)+/gu,
  )) {
    tokens.push(match[0]);
  }
  return tokens;
}

function normalizeDocument(document: SearchDocument, scope: string) {
  const normalized = { ...document, scope };
  const metadataJson = JSON.stringify(document.metadata ?? {});
  const titleTokens = tokenizeSearchText(document.title).join(" ");
  const bodyTokens = tokenizeSearchText(document.body).join(" ");
  const contentHash = createHash("sha256")
    .update(
      [
        normalized.kind,
        normalized.source,
        normalized.title,
        normalized.body,
        metadataJson,
      ].join("\0"),
    )
    .digest("hex");
  return {
    ...normalized,
    metadataJson,
    titleTokens,
    bodyTokens,
    contentHash,
  };
}
