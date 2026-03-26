import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';

const TRANSFORMS = {
  normalize_phone: (val) => {
    if (!val) return val;
    const digits = String(val).replace(/\D/g, '');
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return val;
  },
  uppercase: (val) => val ? String(val).toUpperCase() : val,
  lowercase: (val) => val ? String(val).toLowerCase() : val,
  trim: (val) => val ? String(val).trim() : val,
};

/**
 * Load the field mapping configuration.
 */
export function loadMapping(mappingPath) {
  const paths = [
    mappingPath,
    join(process.cwd(), 'fm-mapping.json'),
    join(getConfigDir(), 'fm-mapping.json'),
  ].filter(Boolean);

  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8'));
    }
  }

  throw new Error('No fm-mapping.json found. Run `sfcli sync mapping init` to create one.');
}

/**
 * Get mapping config for an entity type.
 */
export function getEntityMapping(mapping, entityType) {
  const entity = mapping[entityType];
  if (!entity) throw new Error(`No mapping defined for entity type: ${entityType}`);
  return entity;
}

/**
 * Convert a Service Fusion record to FileMaker field data.
 */
export function sfToFm(record, entityMapping) {
  const fieldData = {};
  const { field_map, transforms = {} } = entityMapping;

  for (const [sfField, fmField] of Object.entries(field_map)) {
    let value = record[sfField];
    if (value === undefined) continue;

    // Apply transform if configured
    const transformName = transforms[sfField];
    if (transformName && TRANSFORMS[transformName]) {
      value = TRANSFORMS[transformName](value);
    }

    fieldData[fmField] = value ?? '';
  }

  return fieldData;
}

/**
 * Convert a FileMaker record to Service Fusion field data.
 */
export function fmToSf(fmRecord, entityMapping) {
  const data = {};
  const { field_map } = entityMapping;
  const fieldData = fmRecord.fieldData || fmRecord;

  // Build reverse map: fmField -> sfField
  const reverseMap = {};
  for (const [sfField, fmField] of Object.entries(field_map)) {
    reverseMap[fmField] = sfField;
  }

  for (const [fmField, sfField] of Object.entries(reverseMap)) {
    if (fieldData[fmField] !== undefined) {
      data[sfField] = fieldData[fmField];
    }
  }

  return data;
}

/**
 * Get the SF ID from a FileMaker record.
 */
export function getSfIdFromFm(fmRecord, entityMapping) {
  const fieldData = fmRecord.fieldData || fmRecord;
  return fieldData[entityMapping.id_field.fm] || null;
}

/**
 * Get the FM record ID (internal).
 */
export function getFmRecordId(fmRecord) {
  return fmRecord.recordId;
}

export { TRANSFORMS };
