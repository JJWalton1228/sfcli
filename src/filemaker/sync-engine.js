import { getLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { sfToFm, fmToSf, getSfIdFromFm, getFmRecordId, getEntityMapping } from './mapper.js';
import { buildFmPushQuery } from './query-builder.js';
import { addConflict, autoResolveStrategy } from './conflict-resolver.js';
import { fetchAll } from '../utils/paginator.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';
import { writeDryRunAudit } from './audit-writer.js';

const SYNC_STATUS_FILE = 'sync-status.json';
const SYNC_LOG_FILE = 'sync-log.json';

function getStatusPath() {
  return join(getConfigDir(), SYNC_STATUS_FILE);
}

function getLogPath() {
  return join(getConfigDir(), SYNC_LOG_FILE);
}

function readSyncStatus() {
  const path = getStatusPath();
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}

function writeSyncStatus(status) {
  const dir = getConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getStatusPath(), JSON.stringify(status, null, 2));
}

function appendSyncLog(entry) {
  try {
    const path = getLogPath();
    const dir = getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    let log = [];
    if (existsSync(path)) {
      try { log = JSON.parse(readFileSync(path, 'utf8')); } catch {}
    }
    log.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep last 500 entries
    if (log.length > 500) log = log.slice(-500);
    writeFileSync(path, JSON.stringify(log, null, 2));
  } catch (err) {
    getLogger().debug(`Unable to write sync log: ${err.message}`);
  }
}

/**
 * Pull records from Service Fusion → FileMaker.
 */
export async function pull(sfClient, fmClient, entityType, entityMapping, options = {}) {
  const logger = getLogger();
  const { since, dryRun = false, conflictStrategy = null } = options;
  const spinner = createSpinner(`Pulling ${entityType}...`);
  spinner.start();

  const stats = { created: 0, updated: 0, conflicts: 0, skipped: 0, errors: 0 };

  try {
    // Fetch SF records
    const params = {};
    if (since) params.updated_after = since;
    const sfRecords = await fetchAll(sfClient, entityMapping.sf_endpoint, params, { showProgress: false });

    spinner.text = `Pulling ${entityType}: ${sfRecords.length} SF records to process`;

    for (const sfRecord of sfRecords) {
      const sfId = sfRecord[entityMapping.id_field.sf];
      if (!sfId) { stats.skipped++; continue; }

      try {
        // Look up in FM by SF ID
        const fmRecord = await fmClient.findOne(
          entityMapping.fm_layout,
          entityMapping.id_field.fm,
          String(sfId)
        );

        const fmFieldData = sfToFm(sfRecord, entityMapping);

        if (!fmRecord) {
          // CREATE in FM
          if (dryRun) {
            logger.debug(`[dry-run] Would create ${entityType} SF#${sfId} in FM`);
          } else {
            await fmClient.createRecord(entityMapping.fm_layout, fmFieldData);
          }
          stats.created++;
        } else {
          // Check for conflict: was FM record also modified?
          const fmModTime = fmRecord.fieldData?.[entityMapping.last_sync_field];
          const fmRecordModTime = fmRecord.modificationTimestamp;

          if (fmModTime && fmRecordModTime && new Date(fmRecordModTime) > new Date(fmModTime)) {
            // FM was modified since last sync — conflict
            const winner = conflictStrategy ? autoResolveStrategy(conflictStrategy, sfRecord, fmRecord.fieldData) : null;

            if (winner === 'sf') {
              if (!dryRun) await fmClient.updateRecord(entityMapping.fm_layout, getFmRecordId(fmRecord), fmFieldData);
              stats.updated++;
            } else if (winner === 'fm') {
              stats.skipped++;
            } else {
              addConflict({
                entityType,
                sfId,
                fmRecordId: getFmRecordId(fmRecord),
                sfData: sfRecord,
                fmData: fmRecord.fieldData,
              });
              stats.conflicts++;
            }
          } else {
            // No conflict — update FM
            if (!dryRun) {
              const updateData = { ...fmFieldData };
              if (entityMapping.last_sync_field) {
                updateData[entityMapping.last_sync_field] = new Date().toISOString();
              }
              await fmClient.updateRecord(entityMapping.fm_layout, getFmRecordId(fmRecord), updateData);
            }
            stats.updated++;
          }
        }
      } catch (err) {
        logger.debug(`Error syncing ${entityType} SF#${sfId}: ${err.message}`);
        stats.errors++;
      }
    }
  } finally {
    spinner.stop();
  }

  appendSyncLog({ direction: 'pull', entityType, stats, dryRun });
  updateSyncTimestamp(entityType, 'pull');
  return stats;
}

/**
 * Push records from FileMaker → Service Fusion.
 */
export async function push(sfClient, fmClient, entityType, entityMapping, options = {}) {
  const logger = getLogger();
  const { dryRun = false, sinceDate, createdSince, fiveYearWindow = false, production = false } = options;
  const spinner = createSpinner(`Pushing ${entityType}...`);
  spinner.start();

  const stats = { created: 0, updated: 0, errors: 0, skipped: 0, duplicates: 0, blocked: 0 };
  const auditRows = [];

  try {
    const query = buildFmPushQuery({ entityType, mapping: entityMapping, sinceDate, createdSince, fiveYearWindow });
    const fmRecords = query
      ? await fmClient.find(entityMapping.fm_layout, query)
      : await fmClient.getAllRecords(entityMapping.fm_layout);
    spinner.text = `Pushing ${entityType}: ${fmRecords.length} FM records to process`;

    if (production && entityType !== 'customers') {
      for (const fmRecord of fmRecords) {
        stats.skipped++;
        stats.blocked++;
        auditRows.push({
          action: 'blocked',
          source_key: getFmRecordId(fmRecord) ?? '',
          reason: 'child entity production writes are blocked until customer org_name references are confirmed',
          sf_id: '',
        });
      }
      return finishPush({ entityType, stats, dryRun, auditRows, options });
    }

    if (production && entityType === 'customers') {
      const result = await pushCustomersProduction({
        sfClient,
        fmRecords,
        entityMapping,
        dryRun,
        syncDb: options.syncDb,
        auditRows,
        logger,
      });
      Object.assign(stats, result);
      return finishPush({ entityType, stats, dryRun, auditRows, options });
    }

    for (const fmRecord of fmRecords) {
      const sfId = getSfIdFromFm(fmRecord, entityMapping);
      const sfData = fmToSf(fmRecord, entityMapping);

      // Remove the ID field from the data to push (SF assigns IDs)
      delete sfData[entityMapping.id_field.sf];

      // Resolve any {placeholder} fragments in the SF endpoint using record data.
      // Placeholders consume their field (removed from body) so a nested endpoint
      // like /customers/{customer_id}/equipment uses customer_id for the path only.
      const { path: resolvedEndpoint, body: resolvedBody } = resolveEndpoint(
        entityMapping.sf_endpoint,
        sfData,
      );

      try {
        if (!sfId) {
          // No SF ID — create in SF
          if (dryRun) {
            logger.debug(`[dry-run] Would create ${entityType} in SF from FM#${getFmRecordId(fmRecord)}`);
          } else {
            const response = await sfClient.post(resolvedEndpoint, resolvedBody);
            const newId = response.data?.id || response.data?.data?.id;
            if (newId) {
              // Write SF ID back to FM
              await fmClient.updateRecord(entityMapping.fm_layout, getFmRecordId(fmRecord), {
                [entityMapping.id_field.fm]: String(newId),
                ...(entityMapping.last_sync_field ? { [entityMapping.last_sync_field]: new Date().toISOString() } : {}),
              });
            }
          }
          stats.created++;
        } else {
          // Has SF ID — update in SF
          if (dryRun) {
            logger.debug(`[dry-run] Would update ${entityType} SF#${sfId} from FM`);
          } else {
            await sfClient.put(`${resolvedEndpoint}/${sfId}`, resolvedBody);
            if (entityMapping.last_sync_field) {
              await fmClient.updateRecord(entityMapping.fm_layout, getFmRecordId(fmRecord), {
                [entityMapping.last_sync_field]: new Date().toISOString(),
              });
            }
          }
          stats.updated++;
        }
      } catch (err) {
        logger.debug(`Error pushing ${entityType} FM#${getFmRecordId(fmRecord)}: ${err.message}`);
        stats.errors++;
      }
    }
  } finally {
    spinner.stop();
  }

  return finishPush({ entityType, stats, dryRun, auditRows, options });
}

async function finishPush({ entityType, stats, dryRun, auditRows, options }) {
  if (dryRun && options.auditDir && auditRows?.length) {
    const files = writeDryRunAudit({ dir: options.auditDir, entityType, rows: auditRows });
    stats.audit = files;
  }
  if (!options.skipLog) {
    appendSyncLog({ direction: 'push', entityType, stats, dryRun });
    updateSyncTimestamp(entityType, 'push');
  }
  return stats;
}

async function pushCustomersProduction({ sfClient, fmRecords, entityMapping, dryRun, syncDb, auditRows, logger }) {
  const stats = { created: 0, updated: 0, errors: 0, skipped: 0, duplicates: 0, blocked: 0 };
  const existingCustomers = await loadExistingCustomers(sfClient);

  for (const fmRecord of fmRecords) {
    const fieldData = fmRecord.fieldData || fmRecord;
    const orgField = entityMapping.production_key_field || 'org_name';
    const orgName = fieldData[orgField];

    if (!orgName) {
      stats.skipped++;
      stats.errors++;
      auditRows.push({
        action: 'skip',
        source_key: '',
        reason: `missing required FileMaker customer key ${orgField}`,
        sf_id: '',
      });
      continue;
    }

    const payload = fmCustomerToSfPayload(fmRecord, entityMapping, orgName);
    const linked = syncDb?.getSyncLink?.('customer', orgName);

    try {
      if (linked?.sf_id) {
        auditRows.push({ action: 'update', source_key: orgName, reason: 'local link', sf_id: linked.sf_id });
        if (!dryRun) await sfClient.put(`${entityMapping.sf_endpoint}/${linked.sf_id}`, payload);
        stats.updated++;
        continue;
      }

      const exactMatches = existingCustomers.filter((customer) => customer.customer_name === orgName);
      if (exactMatches.length > 1) {
        stats.skipped++;
        stats.duplicates++;
        auditRows.push({
          action: 'skip',
          source_key: orgName,
          reason: `duplicate exact Service Fusion customer_name matches: ${exactMatches.map(c => c.id).join('|')}`,
          sf_id: '',
        });
        continue;
      }

      if (exactMatches.length === 1) {
        const sfId = exactMatches[0].id;
        auditRows.push({ action: 'update', source_key: orgName, reason: 'exact customer_name match', sf_id: sfId });
        if (!dryRun) {
          await sfClient.put(`${entityMapping.sf_endpoint}/${sfId}`, payload);
          syncDb?.upsertSyncLink?.({
            entityType: 'customer',
            sourceKey: orgName,
            sfId,
            originalKey: orgName,
            matchEvidence: { type: 'exact_customer_name', customer_name: orgName },
            status: 'linked',
          });
        }
        stats.updated++;
        continue;
      }

      const compositeMatches = findCompositeCustomerMatches(existingCustomers, payload);
      if (compositeMatches.length > 1) {
        stats.skipped++;
        stats.duplicates++;
        auditRows.push({
          action: 'skip',
          source_key: orgName,
          reason: `ambiguous composite customer matches: ${compositeMatches.map(c => c.id).join('|')}`,
          sf_id: '',
        });
        continue;
      }
      if (compositeMatches.length === 1) {
        const sfId = compositeMatches[0].id;
        auditRows.push({ action: 'update', source_key: orgName, reason: 'composite rename match', sf_id: sfId });
        if (!dryRun) {
          await sfClient.put(`${entityMapping.sf_endpoint}/${sfId}`, payload);
          syncDb?.upsertSyncLink?.({
            entityType: 'customer',
            sourceKey: orgName,
            sfId,
            originalKey: orgName,
            matchEvidence: { type: 'composite', fields: ['address', 'phone', 'email'] },
            status: 'linked',
          });
        }
        stats.updated++;
        continue;
      }

      auditRows.push({ action: 'create', source_key: orgName, reason: 'no Service Fusion match', sf_id: '' });
      if (!dryRun) {
        const response = await sfClient.post(entityMapping.sf_endpoint, payload);
        const sfId = response.data?.id || response.data?.data?.id;
        if (sfId) {
          syncDb?.upsertSyncLink?.({
            entityType: 'customer',
            sourceKey: orgName,
            sfId,
            originalKey: orgName,
            matchEvidence: { type: 'created', customer_name: orgName },
            status: 'linked',
          });
        }
      }
      stats.created++;
    } catch (err) {
      logger.debug(`Error pushing customer ${orgName}: ${err.message}`);
      stats.errors++;
      auditRows.push({ action: 'error', source_key: orgName, reason: err.message, sf_id: linked?.sf_id || '' });
    }
  }

  return stats;
}

async function loadExistingCustomers(sfClient) {
  try {
    const response = await sfClient.get('/customers', {
      params: { expand: 'contacts,contacts.phones,contacts.emails,locations' },
    });
    const data = response.data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data?.items)) return data.data.items;
    if (Array.isArray(data)) return data;
  } catch {
    return [];
  }
  return [];
}

function fmCustomerToSfPayload(fmRecord, entityMapping, orgName) {
  const payload = fmToSf(fmRecord, entityMapping);
  delete payload[entityMapping.id_field?.sf];
  delete payload.org_name;
  payload.customer_name = orgName;
  return removeBlankFields(payload);
}

function removeBlankFields(data) {
  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== '') cleaned[key] = value;
  }
  return cleaned;
}

function findCompositeCustomerMatches(customers, payload) {
  const matches = [];
  for (const customer of customers) {
    let score = 0;
    if (payload.email && customerEmails(customer).some(email => lower(payload.email) === lower(email))) score++;
    if (payload.phone && customerPhones(customer).some(phone => normalizePhone(payload.phone) === normalizePhone(phone))) score++;
    if (payload.street_1 && customerAddresses(customer).some(street => lower(payload.street_1) === lower(street))) score++;
    if (score >= 2) matches.push(customer);
  }
  return matches;
}

function customerEmails(customer) {
  const values = [];
  if (customer.email) values.push(customer.email);
  for (const contact of customer.contacts || []) {
    for (const email of contact.emails || []) {
      if (email.email) values.push(email.email);
    }
  }
  return values;
}

function customerPhones(customer) {
  const values = [];
  if (customer.phone) values.push(customer.phone);
  for (const contact of customer.contacts || []) {
    for (const phone of contact.phones || []) {
      if (phone.phone) values.push(phone.phone);
    }
  }
  return values;
}

function customerAddresses(customer) {
  const values = [];
  if (customer.street_1) values.push(customer.street_1);
  for (const location of customer.locations || []) {
    if (location.street_1) values.push(location.street_1);
  }
  return values;
}

function lower(value) {
  return String(value).trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value).replace(/\D/g, '');
}

/**
 * Bidirectional sync: pull then push.
 */
export async function syncBidirectional(sfClient, fmClient, entityType, entityMapping, options = {}) {
  const pullStats = await pull(sfClient, fmClient, entityType, entityMapping, options);
  const pushStats = await push(sfClient, fmClient, entityType, entityMapping, options);
  return { pull: pullStats, push: pushStats };
}

/**
 * Replace {field} placeholders in an endpoint template with values from `data`.
 * Consumed fields are removed from the returned body copy so they don't appear
 * in the request payload (e.g. /customers/{customer_id}/equipment).
 */
function resolveEndpoint(endpoint, data) {
  const body = { ...data };
  const path = endpoint.replace(/\{(\w+)\}/g, (_, field) => {
    const value = body[field];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing value for endpoint placeholder {${field}}`);
    }
    delete body[field];
    return String(value);
  });
  return { path, body };
}

function updateSyncTimestamp(entityType, direction) {
  try {
    const status = readSyncStatus();
    if (!status[entityType]) status[entityType] = {};
    status[entityType][`last_${direction}`] = new Date().toISOString();
    writeSyncStatus(status);
  } catch (err) {
    getLogger().debug(`Unable to write sync status: ${err.message}`);
  }
}

export function getSyncStatus() {
  return readSyncStatus();
}

export function getSyncLog(limit = 50) {
  const path = getLogPath();
  if (!existsSync(path)) return [];
  try {
    const log = JSON.parse(readFileSync(path, 'utf8'));
    return log.slice(-limit);
  } catch {
    return [];
  }
}
