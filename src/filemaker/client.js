import axios from 'axios';
import { getLogger } from '../utils/logger.js';
import { getFmToken, destroyFmToken } from './auth.js';

/**
 * FileMaker Data API client.
 * Manages session token lifecycle and provides CRUD + find operations.
 */
export class FileMakerClient {
  constructor({ host, database, username, password, apiVersion = 'vLatest' }) {
    this.host = host;
    this.database = database;
    this.username = username;
    this.password = password;
    this.apiVersion = apiVersion;
    this.token = null;
    this.logger = getLogger();
  }

  get baseUrl() {
    return `${this.host}/fmi/data/${this.apiVersion}/databases/${encodeURIComponent(this.database)}`;
  }

  async connect() {
    this.token = await getFmToken(this);
    return this;
  }

  async disconnect() {
    if (this.token) {
      await destroyFmToken({ ...this, token: this.token });
      this.token = null;
    }
  }

  async request(method, path, data = null) {
    if (!this.token) await this.connect();

    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`FM ${method.toUpperCase()} ${url}`);

    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        timeout: 30000,
      });
      return response.data?.response ?? response.data;
    } catch (err) {
      // Re-auth on 401 once
      if (err.response?.status === 401 && !err._fmRetried) {
        this.logger.debug('FM token expired, re-authenticating...');
        await this.connect();
        err._fmRetried = true;
        return this.request(method, path, data);
      }
      const msg = err.response?.data?.messages?.[0]?.message || err.message;
      throw new Error(`FileMaker API error: ${msg}`);
    }
  }

  // --- CRUD ---

  async getRecords(layout, { limit = 100, offset = 1 } = {}) {
    const path = `/layouts/${encodeURIComponent(layout)}/records?_limit=${limit}&_offset=${offset}`;
    const result = await this.request('get', path);
    return result.data || [];
  }

  async getRecord(layout, recordId) {
    const path = `/layouts/${encodeURIComponent(layout)}/records/${recordId}`;
    const result = await this.request('get', path);
    return result.data?.[0] || null;
  }

  async createRecord(layout, fieldData) {
    const path = `/layouts/${encodeURIComponent(layout)}/records`;
    const result = await this.request('post', path, { fieldData });
    return result.recordId;
  }

  async updateRecord(layout, recordId, fieldData) {
    const path = `/layouts/${encodeURIComponent(layout)}/records/${recordId}`;
    await this.request('patch', path, { fieldData });
  }

  async deleteRecord(layout, recordId) {
    const path = `/layouts/${encodeURIComponent(layout)}/records/${recordId}`;
    await this.request('delete', path);
  }

  async find(layout, query) {
    const path = `/layouts/${encodeURIComponent(layout)}/_find`;
    try {
      const result = await this.request('post', path, { query });
      return result.data || [];
    } catch (err) {
      // FM returns 401 error code for "no records found"
      if (err.message?.includes('401') || err.message?.includes('No records match')) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Find a single record by a field value.
   */
  async findOne(layout, field, value) {
    const records = await this.find(layout, [{ [field]: `==${value}` }]);
    return records[0] || null;
  }

  /**
   * Get all records (handles FM pagination).
   */
  async getAllRecords(layout, { batchSize = 100 } = {}) {
    const all = [];
    let offset = 1;
    while (true) {
      const batch = await this.getRecords(layout, { limit: batchSize, offset });
      all.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
    return all;
  }
}
