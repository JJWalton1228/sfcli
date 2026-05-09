import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('default FileMaker mapping config', () => {
  const mapping = JSON.parse(readFileSync(join(process.cwd(), 'fm-mapping.json'), 'utf8'));

  it('maps FileMaker org_name to production customer identity', () => {
    expect(mapping.customers.production_key_field).toBe('org_name');
    expect(mapping.customers.field_map.org_name).toBe('org_name');
  });

  it('uses the discovered Service Fusion techs endpoint', () => {
    expect(mapping.technicians.sf_endpoint).toBe('/techs');
  });
});
