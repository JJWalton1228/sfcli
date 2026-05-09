/**
 * Pure functions that transform API response records into normalized row sets
 * for insertion into the normalized SQLite cache tables.
 */

/**
 * Normalize a customer record into separate tables.
 * @param {Object} record - Raw/flattened customer from API
 * @returns {{ customer, locations: [], contacts: [], phones: [], emails: [] }}
 */
export function normalizeCustomer(record) {
  const {
    id, customer_name, account_number, tags, created_at, updated_at,
    contacts = [], locations = [],
  } = record;

  const customer = {
    id,
    customer_name: customer_name ?? null,
    account_number: account_number ?? null,
    tags: Array.isArray(tags) ? JSON.stringify(tags) : (tags ?? null),
    created_at: created_at ?? null,
    updated_at: updated_at ?? null,
    data: JSON.stringify(record),
  };

  const normLocations = (locations || []).map((loc, idx) => ({
    id: loc.id ?? id * 100000 + idx,
    customer_id: id,
    street_1: loc.street_1 ?? null,
    street_2: loc.street_2 ?? null,
    city: loc.city ?? null,
    state: loc.state_prov ?? loc.state ?? null,
    zip: loc.postal_code ?? loc.zip ?? null,
    is_primary: loc.is_primary ? 1 : 0,
  }));

  const normContacts = [];
  const normPhones = [];
  const normEmails = [];

  for (const contact of (contacts || [])) {
    normContacts.push({
      id: contact.id ?? null,
      customer_id: id,
      first_name: contact.fname ?? contact.first_name ?? null,
      last_name: contact.lname ?? contact.last_name ?? null,
      is_primary: contact.is_primary ? 1 : 0,
    });

    for (const phone of (contact.phones || [])) {
      normPhones.push({
        id: phone.id ?? null,
        contact_id: contact.id ?? null,
        customer_id: id,
        phone: phone.phone ?? null,
        type: phone.type ?? null,
      });
    }

    for (const email of (contact.emails || [])) {
      normEmails.push({
        id: email.id ?? null,
        contact_id: contact.id ?? null,
        customer_id: id,
        email: email.email ?? null,
        type: email.type ?? null,
      });
    }
  }

  return {
    customer,
    locations: normLocations,
    contacts: normContacts,
    phones: normPhones,
    emails: normEmails,
  };
}

/**
 * Normalize a job record.
 * @param {Object} record
 * @returns {{ job, job_techs: [] }}
 */
export function normalizeJob(record) {
  const {
    id, customer_id, customer_name, number, status, description,
    start_date, end_date, closed_at, total, due_total,
    city, state_prov, postal_code,
    created_at, techs_assigned = [],
  } = record;

  const job = {
    id,
    customer_id: customer_id ?? null,
    customer_name: customer_name ?? null,
    number: number ?? null,
    status: status ?? null,
    description: description ?? null,
    start_date: start_date ?? null,
    end_date: end_date ?? null,
    closed_at: closed_at ?? null,
    total: total ?? null,
    due_total: due_total ?? null,
    city: city ?? null,
    state: state_prov ?? record.state ?? null,
    zip: postal_code ?? record.zip ?? null,
    created_at: created_at ?? null,
    data: JSON.stringify(record),
  };

  const job_techs = (techs_assigned || [])
    .filter(t => t && t.id)
    .map(t => ({ job_id: id, tech_id: t.id }));

  return { job, job_techs };
}

/**
 * Normalize an estimate record.
 */
export function normalizeEstimate(record) {
  const {
    id, customer_id, customer_name, number, status, description,
    total, due_total, city, state_prov, created_at,
  } = record;

  return {
    estimate: {
      id,
      customer_id: customer_id ?? null,
      customer_name: customer_name ?? null,
      number: number ?? null,
      status: status ?? null,
      description: description ?? null,
      total: total ?? null,
      due_total: due_total ?? null,
      city: city ?? null,
      state: state_prov ?? record.state ?? null,
      created_at: created_at ?? null,
      data: JSON.stringify(record),
    },
  };
}

/**
 * Normalize an invoice record.
 */
export function normalizeInvoice(record) {
  const {
    id, customer_id, customer, number, is_paid, total, date, terms, created_at,
  } = record;

  return {
    invoice: {
      id,
      customer_id: customer_id ?? null,
      customer: customer ?? null,
      number: number ?? null,
      is_paid: is_paid ? 1 : 0,
      total: total ?? null,
      date: date ?? null,
      terms: terms ?? null,
      created_at: created_at ?? null,
      data: JSON.stringify(record),
    },
  };
}

/**
 * Normalize a technician record.
 */
export function normalizeTech(record) {
  const {
    id, first_name, last_name, email, phone_1, department, is_field_worker,
  } = record;

  return {
    tech: {
      id,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      email: email ?? null,
      phone: phone_1 ?? record.phone ?? null,
      department: department ?? null,
      is_field_worker: is_field_worker ? 1 : 0,
      data: JSON.stringify(record),
    },
  };
}

/**
 * Normalize an equipment record.
 */
export function normalizeEquipment(record) {
  const {
    id, customer_id, type, make, model, serial_number,
    location, install_date, warranty_date,
  } = record;

  return {
    equipment: {
      id,
      customer_id: customer_id ?? null,
      type: type ?? null,
      make: make ?? null,
      model: model ?? null,
      serial_number: serial_number ?? null,
      location: location ?? null,
      install_date: install_date ?? null,
      warranty_date: warranty_date ?? null,
      data: JSON.stringify(record),
    },
  };
}
