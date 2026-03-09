const { google } = require('googleapis');

class CalendarClient {
  constructor() {
    this.calendar = null;
    this.calendarId = null;
  }

  async init() {
    this.calendarId = process.env.GOOGLE_CALENDAR_ID;
    const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

    if (!this.calendarId) {
      console.warn('GOOGLE_CALENDAR_ID not set - calendar booking disabled');
      return;
    }

    const path = require('path');
    const keyFile = path.join(__dirname, '..', serviceAccountPath.replace('./', ''));

    const auth = new google.auth.GoogleAuth({
      keyFile: keyFile,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    this.calendar = google.calendar({ version: 'v3', auth });
    console.log('Google Calendar connected');
  }

  isEnabled() {
    return this.calendar !== null;
  }

  // Get available slots for the next N days
  async getAvailableSlots(daysAhead = 7, slotDurationMinutes = 60) {
    if (!this.calendar) {
      console.log('[MOCK CALENDAR] Would check availability');
      return this._getMockSlots();
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // Get busy times from calendar
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: this.calendarId }],
      },
    });

    const busyTimes = response.data.calendars[this.calendarId]?.busy || [];

    // Generate available slots (9am-5pm, excluding busy times)
    const slots = [];
    const current = new Date(now);
    current.setHours(9, 0, 0, 0);

    if (current < now) {
      current.setDate(current.getDate() + 1);
    }

    while (current < endDate && slots.length < 6) {
      const dayOfWeek = current.getDay();

      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        for (let hour = 9; hour < 17; hour++) {
          const slotStart = new Date(current);
          slotStart.setHours(hour, 0, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);

          // Skip if slot is in the past
          if (slotStart < now) continue;

          // Check if slot overlaps with any busy time
          const isBusy = busyTimes.some(busy => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return slotStart < busyEnd && slotEnd > busyStart;
          });

          if (!isBusy) {
            slots.push({
              start: slotStart,
              end: slotEnd,
              display: this._formatSlot(slotStart),
            });

            if (slots.length >= 6) break;
          }
        }
      }

      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0);
    }

    return slots;
  }

  // Book an appointment
  async createBooking(lead, slot, config) {
    const event = {
      summary: `Pool Service - ${lead.name || 'New Customer'}`,
      description: `Lead ID: ${lead.lead_id}
Phone: ${lead.phone}
Address: ${lead.address || 'TBD'}
Pool Type: ${lead.pool_type || 'Unknown'}
Pool Size: ${lead.pool_size || 'Unknown'}
Service: ${lead.service_type || 'TBD'}
Notes: ${lead.notes || 'None'}`,
      start: {
        dateTime: slot.start.toISOString(),
        timeZone: config.timezone || 'America/Phoenix',
      },
      end: {
        dateTime: slot.end.toISOString(),
        timeZone: config.timezone || 'America/Phoenix',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    if (!this.calendar) {
      console.log('[MOCK CALENDAR] Would create event:', event.summary);
      return {
        id: 'mock_event_' + Date.now(),
        htmlLink: 'https://calendar.google.com/mock',
        start: slot.start,
        end: slot.end,
      };
    }

    const response = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: event,
    });

    console.log(`Booking created: ${response.data.id}`);
    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink,
      start: slot.start,
      end: slot.end,
    };
  }

  _formatSlot(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const hour = date.getHours();
    const ampm = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 || 12;

    return `${dayName} ${month} ${day} at ${hour12}${ampm}`;
  }

  _getMockSlots() {
    const slots = [];
    const now = new Date();
    let current = new Date(now);
    current.setDate(current.getDate() + 1);
    current.setHours(9, 0, 0, 0);

    for (let i = 0; i < 3; i++) {
      while (current.getDay() === 0 || current.getDay() === 6) {
        current.setDate(current.getDate() + 1);
      }

      slots.push({
        start: new Date(current),
        end: new Date(current.getTime() + 60 * 60 * 1000),
        display: this._formatSlot(current),
      });

      current.setDate(current.getDate() + 1);
    }

    return slots;
  }
}

module.exports = new CalendarClient();
