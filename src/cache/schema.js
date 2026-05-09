/**
 * Normalized cache schema definition + migration logic.
 * Single source of truth for all table DDL and schema versioning.
 */

export const SCHEMA_VERSION = 3;

const TABLES = `
  CREATE TABLE IF NOT EXISTS cache_meta (
    entity TEXT PRIMARY KEY,
    refreshed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS cache_customers (
    id INTEGER PRIMARY KEY,
    customer_name TEXT,
    account_number TEXT,
    tags TEXT,
    created_at TEXT,
    updated_at TEXT,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS cache_locations (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    street_1 TEXT,
    street_2 TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    is_primary INTEGER DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES cache_customers(id)
  );

  CREATE TABLE IF NOT EXISTS cache_contacts (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    is_primary INTEGER DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES cache_customers(id)
  );

  CREATE TABLE IF NOT EXISTS cache_phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER,
    customer_id INTEGER NOT NULL,
    phone TEXT,
    type TEXT,
    FOREIGN KEY (contact_id) REFERENCES cache_contacts(id),
    FOREIGN KEY (customer_id) REFERENCES cache_customers(id)
  );

  CREATE TABLE IF NOT EXISTS cache_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER,
    customer_id INTEGER NOT NULL,
    email TEXT,
    type TEXT,
    FOREIGN KEY (contact_id) REFERENCES cache_contacts(id),
    FOREIGN KEY (customer_id) REFERENCES cache_customers(id)
  );

  CREATE TABLE IF NOT EXISTS cache_jobs (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    customer_name TEXT,
    number TEXT,
    status TEXT,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    closed_at TEXT,
    total REAL,
    due_total REAL,
    city TEXT,
    state TEXT,
    zip TEXT,
    created_at TEXT,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS cache_job_techs (
    job_id INTEGER NOT NULL,
    tech_id INTEGER NOT NULL,
    PRIMARY KEY (job_id, tech_id),
    FOREIGN KEY (job_id) REFERENCES cache_jobs(id),
    FOREIGN KEY (tech_id) REFERENCES cache_techs(id)
  );

  CREATE TABLE IF NOT EXISTS cache_estimates (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    customer_name TEXT,
    number TEXT,
    status TEXT,
    description TEXT,
    total REAL,
    due_total REAL,
    city TEXT,
    state TEXT,
    created_at TEXT,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS cache_invoices (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    customer TEXT,
    number TEXT,
    is_paid INTEGER,
    total REAL,
    date TEXT,
    terms TEXT,
    created_at TEXT,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS cache_techs (
    id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    department TEXT,
    is_field_worker INTEGER,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS cache_equipment (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    type TEXT,
    make TEXT,
    model TEXT,
    serial_number TEXT,
    location TEXT,
    install_date TEXT,
    warranty_date TEXT,
    data TEXT
  );

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
`;

const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_locations_customer ON cache_locations(customer_id);
  CREATE INDEX IF NOT EXISTS idx_locations_city ON cache_locations(city);
  CREATE INDEX IF NOT EXISTS idx_locations_state ON cache_locations(state);
  CREATE INDEX IF NOT EXISTS idx_locations_zip ON cache_locations(zip);
  CREATE INDEX IF NOT EXISTS idx_contacts_customer ON cache_contacts(customer_id);
  CREATE INDEX IF NOT EXISTS idx_phones_customer ON cache_phones(customer_id);
  CREATE INDEX IF NOT EXISTS idx_phones_phone ON cache_phones(phone);
  CREATE INDEX IF NOT EXISTS idx_emails_customer ON cache_emails(customer_id);
  CREATE INDEX IF NOT EXISTS idx_emails_email ON cache_emails(email);
  CREATE INDEX IF NOT EXISTS idx_jobs_customer ON cache_jobs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON cache_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_start ON cache_jobs(start_date);
  CREATE INDEX IF NOT EXISTS idx_job_techs_tech ON cache_job_techs(tech_id);
  CREATE INDEX IF NOT EXISTS idx_estimates_customer ON cache_estimates(customer_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_customer ON cache_invoices(customer_id);
  CREATE INDEX IF NOT EXISTS idx_equipment_customer ON cache_equipment(customer_id);
  CREATE INDEX IF NOT EXISTS idx_sync_links_sf ON sync_links(entity_type, sf_id);
`;

const CACHE_TABLES = [
  'cache_customers', 'cache_locations', 'cache_contacts', 'cache_phones',
  'cache_emails', 'cache_jobs', 'cache_job_techs', 'cache_estimates',
  'cache_invoices', 'cache_techs', 'cache_equipment',
];

/**
 * Get the current schema version from the database.
 * Returns 0 if no version is stored (legacy or fresh db).
 */
export function getSchemaVersion(db) {
  try {
    const row = db.prepare(
      "SELECT refreshed_at FROM cache_meta WHERE entity = '__schema_version'"
    ).get();
    return row ? parseInt(row.refreshed_at, 10) : 0;
  } catch {
    // cache_meta table doesn't exist yet
    return 0;
  }
}

/**
 * Initialize the normalized schema. Detects version mismatch and
 * drops/recreates all tables when needed.
 */
export function initNormalizedSchema(db) {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion !== SCHEMA_VERSION) {
    // Drop all existing cache tables (legacy or outdated)
    const existingTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cache_%'"
    ).all().map(r => r.name);

    for (const table of existingTables) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  // Create all tables and indexes
  db.exec(TABLES);
  db.exec(INDEXES);

  // Store schema version
  db.prepare(
    "INSERT OR REPLACE INTO cache_meta (entity, refreshed_at) VALUES ('__schema_version', ?)"
  ).run(String(SCHEMA_VERSION));
}
