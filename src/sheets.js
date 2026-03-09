const { google } = require('googleapis');

class SheetsClient {
  constructor() {
    this.sheets = null;
    this.sheetId = null;
  }

  async init() {
    // Read env vars at init time (after dotenv has loaded)
    this.sheetId = process.env.GOOGLE_SHEET_ID;
    const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

    console.log('Sheet ID:', this.sheetId);
    console.log('Service Account Path:', serviceAccountPath);

    if (!this.sheetId) {
      throw new Error('GOOGLE_SHEET_ID not set in environment');
    }

    // Use service account credentials
    const path = require('path');
    const keyFile = path.join(__dirname, '..', serviceAccountPath.replace('./', ''));

    const auth = new google.auth.GoogleAuth({
      keyFile: keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    console.log('Google Sheets connected');
  }

  // ============ LEADS ============

  async findLeadByPhone(phone) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'Leads!A:N',
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return null; // No data rows

    const headers = rows[0];
    const phoneIndex = headers.indexOf('phone');

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][phoneIndex] === phone) {
        const lead = {};
        headers.forEach((header, idx) => {
          lead[header] = rows[i][idx] || null;
        });
        lead._rowIndex = i + 1; // 1-indexed for Sheets API
        return lead;
      }
    }
    return null;
  }

  async createLead(lead) {
    const row = [
      lead.lead_id,
      lead.phone,
      lead.name || '',
      lead.city || '',
      lead.address || '',
      lead.pool_type || '',
      lead.pool_size || '',
      lead.pool_condition || '',
      lead.service_type || '',
      lead.status || 'new',
      lead.last_message_at || new Date().toISOString(),
      lead.next_followup_at || '',
      lead.notes || '',
      lead.source || 'sms'
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: 'Leads!A:N',
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    console.log(`Created lead: ${lead.lead_id}`);
    return lead;
  }

  async updateLead(lead) {
    if (!lead._rowIndex) {
      // Need to find the row first
      const existing = await this.findLeadByPhone(lead.phone);
      if (!existing) throw new Error('Lead not found for update');
      lead._rowIndex = existing._rowIndex;
    }

    const row = [
      lead.lead_id,
      lead.phone,
      lead.name || '',
      lead.city || '',
      lead.address || '',
      lead.pool_type || '',
      lead.pool_size || '',
      lead.pool_condition || '',
      lead.service_type || '',
      lead.status || 'new',
      lead.last_message_at || new Date().toISOString(),
      lead.next_followup_at || '',
      lead.notes || '',
      lead.source || 'sms'
    ];

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `Leads!A${lead._rowIndex}:N${lead._rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    console.log(`Updated lead: ${lead.lead_id}`);
    return lead;
  }

  // ============ MESSAGES ============

  async logMessage(leadId, direction, text) {
    const row = [
      leadId,
      new Date().toISOString(),
      direction,
      text
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: 'Messages!A:D',
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    console.log(`Logged ${direction} message for ${leadId}`);
  }

  async getMessageHistory(leadId, limit = 10) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'Messages!A:D',
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const messages = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === leadId) {
        const msg = {};
        headers.forEach((header, idx) => {
          msg[header] = rows[i][idx] || null;
        });
        messages.push(msg);
      }
    }

    // Sort by timestamp and return last N
    return messages
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-limit);
  }

  // ============ CONFIG ============

  async getConfig() {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'Config!A:B',
    });

    const rows = response.data.values || [];
    const config = {};

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) {
        config[rows[i][0]] = rows[i][1] || '';
      }
    }

    return config;
  }
}

module.exports = new SheetsClient();
