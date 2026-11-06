// Keep revision bytes stable across PostgreSQL JSONB key ordering and BIGINT decoding.
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export function databaseSnapshot(records: any[]) {
  const normalized = records.map((row) => ({
    kind: row.kind,
    id: row.id,
    data: row.data,
    parent: row.parent ?? null,
    work: row.work ?? null,
    ordinal: Number(row.ordinal ?? 0),
    sort: row.sort ?? "",
  }));
  normalized.sort((a, b) => {
    const left = `${a.kind}\0${a.id}`,
      right = `${b.kind}\0${b.id}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return Buffer.from(
    JSON.stringify(
      canonical({ format: "dmx-story-records-v1", records: normalized }),
    ),
  );
}
