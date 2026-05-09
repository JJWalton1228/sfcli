/**
 * Local read/write state for the FileMaker read-only sync.
 * FileMaker remains untouched; links live on the designated sync machine.
 */

export function initSyncLinkSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_links (
      entity_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      sf_id TEXT NOT NULL,
      original_key TEXT,
      match_evidence TEXT,
      status TEXT NOT NULL DEFAULT 'linked',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entity_type, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_links_sf
      ON sync_links(entity_type, sf_id);
  `);
}

export function getSyncLink(db, entityType, sourceKey) {
  const row = db.prepare(`
    SELECT entity_type, source_key, sf_id, original_key, match_evidence, status, created_at, updated_at
    FROM sync_links
    WHERE entity_type = ? AND source_key = ?
  `).get(entityType, sourceKey);
  if (!row) return null;
  return {
    ...row,
    match_evidence: parseJson(row.match_evidence),
  };
}

export function upsertSyncLink(db, {
  entityType,
  sourceKey,
  sfId,
  originalKey = sourceKey,
  matchEvidence = {},
  status = 'linked',
}) {
  db.prepare(`
    INSERT INTO sync_links (
      entity_type, source_key, sf_id, original_key, match_evidence, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(entity_type, source_key) DO UPDATE SET
      sf_id = excluded.sf_id,
      original_key = excluded.original_key,
      match_evidence = excluded.match_evidence,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    entityType,
    sourceKey,
    String(sfId),
    originalKey,
    JSON.stringify(matchEvidence ?? {}),
    status,
  );
  return getSyncLink(db, entityType, sourceKey);
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
