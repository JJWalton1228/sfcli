import { describe, it, expect } from 'vitest';
import {
  normalizeCustomer,
  normalizeJob,
  normalizeEstimate,
  normalizeInvoice,
  normalizeTech,
  normalizeEquipment,
} from '../../src/cache/normalizer.js';

describe('normalizer', () => {
  describe('normalizeCustomer', () => {
    it('decomposes a customer with locations, contacts, phones, and emails', () => {
      const record = {
        id: 1,
        customer_name: 'Acme Corp',
        account_number: 'A001',
        tags: ['vip', 'commercial'],
        created_at: '2025-01-01',
        contacts: [
          {
            id: 10,
            fname: 'John',
            lname: 'Doe',
            is_primary: true,
            phones: [{ id: 100, phone: '555-1234', type: 'work' }],
            emails: [{ id: 200, email: 'john@acme.com', type: 'work' }],
          },
          {
            id: 11,
            fname: 'Jane',
            lname: 'Smith',
            is_primary: false,
            phones: [
              { id: 101, phone: '555-5678', type: 'mobile' },
              { id: 102, phone: '555-9999', type: 'home' },
            ],
            emails: [],
          },
        ],
        locations: [
          { id: 50, street_1: '123 Main St', street_2: 'Suite 100', city: 'Austin', state_prov: 'TX', postal_code: '78701', is_primary: true },
          { id: 51, street_1: '456 Oak Ave', city: 'Dallas', state_prov: 'TX', postal_code: '75201', is_primary: false },
        ],
      };

      const result = normalizeCustomer(record);

      // Customer row
      expect(result.customer.id).toBe(1);
      expect(result.customer.customer_name).toBe('Acme Corp');
      expect(result.customer.account_number).toBe('A001');
      expect(result.customer.tags).toBe('["vip","commercial"]');

      // Locations
      expect(result.locations).toHaveLength(2);
      expect(result.locations[0]).toMatchObject({
        id: 50, customer_id: 1, street_1: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', is_primary: 1,
      });
      expect(result.locations[1]).toMatchObject({
        id: 51, customer_id: 1, city: 'Dallas', state: 'TX', zip: '75201', is_primary: 0,
      });

      // Contacts
      expect(result.contacts).toHaveLength(2);
      expect(result.contacts[0]).toMatchObject({
        id: 10, customer_id: 1, first_name: 'John', last_name: 'Doe', is_primary: 1,
      });

      // Phones (denormalized customer_id)
      expect(result.phones).toHaveLength(3);
      expect(result.phones[0]).toMatchObject({
        contact_id: 10, customer_id: 1, phone: '555-1234', type: 'work',
      });
      expect(result.phones[1]).toMatchObject({ contact_id: 11, customer_id: 1, phone: '555-5678' });
      expect(result.phones[2]).toMatchObject({ contact_id: 11, customer_id: 1, phone: '555-9999' });

      // Emails
      expect(result.emails).toHaveLength(1);
      expect(result.emails[0]).toMatchObject({
        contact_id: 10, customer_id: 1, email: 'john@acme.com',
      });
    });

    it('handles customer with empty/missing nested arrays', () => {
      const result = normalizeCustomer({
        id: 2,
        customer_name: 'Solo LLC',
      });

      expect(result.customer.id).toBe(2);
      expect(result.locations).toEqual([]);
      expect(result.contacts).toEqual([]);
      expect(result.phones).toEqual([]);
      expect(result.emails).toEqual([]);
    });

    it('handles locations without IDs by generating synthetic ones', () => {
      const result = normalizeCustomer({
        id: 3,
        customer_name: 'NoIdLoc',
        locations: [
          { city: 'Houston', state_prov: 'TX', is_primary: true },
        ],
        contacts: [],
      });

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0].customer_id).toBe(3);
      expect(result.locations[0].city).toBe('Houston');
      // Synthetic ID should be based on customer_id to avoid collisions
      expect(result.locations[0].id).toBeDefined();
    });
  });

  describe('normalizeJob', () => {
    it('extracts job_techs from techs_assigned array', () => {
      const result = normalizeJob({
        id: 100,
        customer_id: 1,
        customer_name: 'Acme',
        number: 'J-001',
        status: 'Completed',
        description: 'Fix HVAC',
        start_date: '2025-03-01',
        end_date: '2025-03-01',
        total: 500,
        city: 'Austin',
        state_prov: 'TX',
        postal_code: '78701',
        techs_assigned: [
          { id: 5, first_name: 'Mike' },
          { id: 8, first_name: 'Dan' },
        ],
      });

      expect(result.job.id).toBe(100);
      expect(result.job.status).toBe('Completed');
      expect(result.job.total).toBe(500);
      expect(result.job.city).toBe('Austin');
      expect(result.job.state).toBe('TX');
      expect(result.job.zip).toBe('78701');

      expect(result.job_techs).toHaveLength(2);
      expect(result.job_techs[0]).toEqual({ job_id: 100, tech_id: 5 });
      expect(result.job_techs[1]).toEqual({ job_id: 100, tech_id: 8 });
    });

    it('handles job with no techs_assigned', () => {
      const result = normalizeJob({
        id: 101,
        customer_id: 1,
        status: 'Open',
      });

      expect(result.job.id).toBe(101);
      expect(result.job_techs).toEqual([]);
    });
  });

  describe('normalizeEstimate', () => {
    it('normalizes estimate fields', () => {
      const result = normalizeEstimate({
        id: 200,
        customer_id: 1,
        customer_name: 'Acme',
        number: 'E-001',
        status: 'Approved',
        description: 'New install',
        total: 3000,
        city: 'Austin',
        state_prov: 'TX',
        created_at: '2025-01-15',
      });

      expect(result.estimate.id).toBe(200);
      expect(result.estimate.status).toBe('Approved');
      expect(result.estimate.state).toBe('TX');
    });
  });

  describe('normalizeInvoice', () => {
    it('normalizes invoice fields', () => {
      const result = normalizeInvoice({
        id: 300,
        customer_id: 5,
        customer: 'Acme Corp',
        number: 'INV-001',
        is_paid: true,
        total: 1500,
        date: '2025-02-01',
        terms: 'Net 30',
        created_at: '2025-02-01',
      });

      expect(result.invoice.id).toBe(300);
      expect(result.invoice.is_paid).toBe(1);
      expect(result.invoice.customer).toBe('Acme Corp');
    });
  });

  describe('normalizeTech', () => {
    it('normalizes tech fields', () => {
      const result = normalizeTech({
        id: 5,
        first_name: 'Mike',
        last_name: 'Johnson',
        email: 'mike@co.com',
        phone_1: '555-0001',
        department: 'HVAC',
        is_field_worker: true,
      });

      expect(result.tech.id).toBe(5);
      expect(result.tech.phone).toBe('555-0001');
      expect(result.tech.department).toBe('HVAC');
      expect(result.tech.is_field_worker).toBe(1);
    });
  });

  describe('normalizeEquipment', () => {
    it('normalizes equipment fields', () => {
      const result = normalizeEquipment({
        id: 400,
        customer_id: 1,
        type: 'HVAC',
        make: 'Carrier',
        model: '24ACC636',
        serial_number: 'SN123',
        location: 'Rooftop',
        install_date: '2023-06-15',
      });

      expect(result.equipment.id).toBe(400);
      expect(result.equipment.make).toBe('Carrier');
      expect(result.equipment.customer_id).toBe(1);
    });
  });
});
