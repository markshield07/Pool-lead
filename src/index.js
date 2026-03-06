require('dotenv').config({ path: '../.env' });

const express = require('express');
const sheets = require('./sheets');
const claude = require('./claude');
const twilio = require('./twilio');
const goto = require('./goto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main SMS webhook endpoint
app.post('/webhook/sms', async (req, res) => {
  console.log('\n=== Incoming SMS ===');

  try {
    // Extract data from Twilio webhook (or test JSON)
    const phone = req.body.From;
    const inboundText = req.body.Body;

    if (!phone || !inboundText) {
      console.error('Missing From or Body in request');
      return res.status(400).json({ error: 'Missing From or Body' });
    }

    console.log(`From: ${phone}`);
    console.log(`Message: ${inboundText}`);

    // 1. Look up or create lead
    let lead = await sheets.findLeadByPhone(phone);
    let isNewLead = false;

    if (!lead) {
      isNewLead = true;
      lead = {
        lead_id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        phone: phone,
        name: null,
        city: null,
        address: null,
        pool_type: null,
        pool_size: null,
        pool_condition: null,
        service_type: null,
        status: 'new',
        last_message_at: new Date().toISOString(),
        next_followup_at: null,
        notes: null
      };
      await sheets.createLead(lead);
      console.log('Created new lead');
    } else {
      console.log('Found existing lead:', lead.lead_id);
    }

    // 2. Log inbound message
    await sheets.logMessage(lead.lead_id, 'in', inboundText);

    // 3. Get message history
    const messages = await sheets.getMessageHistory(lead.lead_id);
    console.log(`Message history: ${messages.length} messages`);

    // 4. Get config
    const config = await sheets.getConfig();

    // 5. Call Claude for response
    const claudeResponse = await claude.getResponse(lead, messages, config, inboundText);

    // 6. Update lead with extracted fields
    const fieldsExtracted = claudeResponse.fields_extracted || {};
    Object.keys(fieldsExtracted).forEach(key => {
      if (fieldsExtracted[key] !== null && fieldsExtracted[key] !== undefined) {
        lead[key] = fieldsExtracted[key];
      }
    });

    lead.status = claudeResponse.lead_status || lead.status;
    lead.last_message_at = new Date().toISOString();

    // Set follow-up if not terminal state
    if (!['booked', 'unqualified', 'handoff'].includes(claudeResponse.lead_status)) {
      lead.next_followup_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else {
      lead.next_followup_at = null;
    }

    await sheets.updateLead(lead);

    // 7. Send SMS reply
    const replyText = claudeResponse.reply_text;
    await twilio.sendSMS(phone, replyText);

    // 8. Log outbound message
    await sheets.logMessage(lead.lead_id, 'out', replyText);

    // 9. Notify owner if handoff needed
    if (claudeResponse.intent === 'handoff') {
      await twilio.notifyOwner(phone, claudeResponse.handoff_reason, inboundText, config);
    }

    console.log('=== Done ===\n');

    // Return TwiML empty response (Twilio expects this)
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  } catch (error) {
    console.error('Error processing SMS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint (JSON format for easy testing)
app.post('/test/sms', async (req, res) => {
  console.log('\n=== Test SMS ===');

  try {
    const phone = req.body.From || req.body.phone;
    const inboundText = req.body.Body || req.body.message;

    if (!phone || !inboundText) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    // Same logic as webhook, but returns JSON
    let lead = await sheets.findLeadByPhone(phone);
    let isNewLead = false;

    if (!lead) {
      isNewLead = true;
      lead = {
        lead_id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        phone: phone,
        name: null,
        city: null,
        address: null,
        pool_type: null,
        pool_size: null,
        pool_condition: null,
        service_type: null,
        status: 'new',
        last_message_at: new Date().toISOString(),
        next_followup_at: null,
        notes: null
      };
      await sheets.createLead(lead);
    }

    await sheets.logMessage(lead.lead_id, 'in', inboundText);
    const messages = await sheets.getMessageHistory(lead.lead_id);
    const config = await sheets.getConfig();
    const claudeResponse = await claude.getResponse(lead, messages, config, inboundText);

    // Update lead
    const fieldsExtracted = claudeResponse.fields_extracted || {};
    Object.keys(fieldsExtracted).forEach(key => {
      if (fieldsExtracted[key] !== null && fieldsExtracted[key] !== undefined) {
        lead[key] = fieldsExtracted[key];
      }
    });
    lead.status = claudeResponse.lead_status || lead.status;
    lead.last_message_at = new Date().toISOString();
    await sheets.updateLead(lead);

    // Log outbound (but don't actually send SMS in test mode)
    await sheets.logMessage(lead.lead_id, 'out', claudeResponse.reply_text);

    res.json({
      success: true,
      isNewLead,
      lead_id: lead.lead_id,
      reply: claudeResponse.reply_text,
      status: claudeResponse.lead_status,
      intent: claudeResponse.intent,
      fields_extracted: claudeResponse.fields_extracted
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ GoTo Missed Call Webhook ============
app.post('/webhook/goto-missed-call', async (req, res) => {
  console.log('\n=== GoTo Call Event ===');

  try {
    // GoTo sends verification request first
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.includes('GoTo Notifications')) {
      console.log('GoTo webhook verification - responding OK');
      return res.status(200).send('OK');
    }

    // Parse the call event
    const event = goto.parseCallEvent(req.body);
    console.log('Call event:', event.eventType, event.direction);

    // Only process missed inbound calls
    if (!goto.isMissedCall(event)) {
      console.log('Not a missed call, ignoring');
      return res.status(200).json({ ignored: true });
    }

    const phone = event.callerPhone;
    if (!phone) {
      console.error('No caller phone number in event');
      return res.status(200).json({ error: 'No caller phone' });
    }

    console.log(`Missed call from: ${phone}`);

    // 1. Look up or create lead
    let lead = await sheets.findLeadByPhone(phone);
    let isNewLead = false;

    if (!lead) {
      isNewLead = true;
      lead = {
        lead_id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        phone: phone,
        name: event.callerName || null,
        city: null,
        address: null,
        pool_type: null,
        pool_size: null,
        pool_condition: null,
        service_type: null,
        status: 'new',
        last_message_at: new Date().toISOString(),
        next_followup_at: null,
        notes: null,
        source: 'missed_call'
      };
      await sheets.createLead(lead);
      console.log('Created new lead from missed call');
    } else {
      console.log('Found existing lead:', lead.lead_id);
    }

    // 2. Get config for greeting message
    const config = await sheets.getConfig();
    let greeting = config.missed_call_greeting ||
      "Hey! Sorry we missed your call. Need pool service? Reply here and I'll help get you scheduled.";

    // Replace {business_name} placeholder
    if (config.business_name) {
      greeting = greeting.replace('{business_name}', config.business_name);
    }

    // 3. Log as system-initiated outbound
    await sheets.logMessage(lead.lead_id, 'out', `[MISSED CALL AUTO-REPLY] ${greeting}`);

    // 4. Send SMS via Twilio
    await twilio.sendSMS(phone, greeting);

    // 5. Set follow-up
    lead.last_message_at = new Date().toISOString();
    lead.next_followup_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sheets.updateLead(lead);

    console.log('=== Missed call handled ===\n');
    res.status(200).json({ success: true, lead_id: lead.lead_id });

  } catch (error) {
    console.error('Error processing missed call:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Test Missed Call (for development) ============
app.post('/test/missed-call', async (req, res) => {
  console.log('\n=== Test Missed Call ===');

  try {
    const phone = req.body.phone;
    const callerName = req.body.name;

    if (!phone) {
      return res.status(400).json({ error: 'Missing phone' });
    }

    // Simulate missed call event
    const mockEvent = {
      conversationSpaceId: 'test_' + Date.now(),
      direction: 'INBOUND',
      eventType: 'ENDING',
      participants: [
        {
          type: { value: phone, name: callerName },
          status: 'DISCONNECTED',
          previousStatus: 'RINGING'
        }
      ]
    };

    // Reuse the webhook logic by calling the endpoint internally
    req.body = mockEvent;
    req.headers['user-agent'] = 'Test';

    // Process as missed call
    const event = goto.parseCallEvent(mockEvent);

    let lead = await sheets.findLeadByPhone(phone);
    let isNewLead = !lead;

    if (!lead) {
      lead = {
        lead_id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        phone: phone,
        name: callerName || null,
        city: null,
        address: null,
        pool_type: null,
        pool_size: null,
        pool_condition: null,
        service_type: null,
        status: 'new',
        last_message_at: new Date().toISOString(),
        next_followup_at: null,
        notes: null,
        source: 'missed_call'
      };
      await sheets.createLead(lead);
    }

    const config = await sheets.getConfig();
    let greeting = config.missed_call_greeting ||
      "Hey! Sorry we missed your call. Need pool service? Reply here and I'll help get you scheduled.";

    if (config.business_name) {
      greeting = greeting.replace('{business_name}', config.business_name);
    }

    await sheets.logMessage(lead.lead_id, 'out', `[MISSED CALL AUTO-REPLY] ${greeting}`);

    lead.last_message_at = new Date().toISOString();
    lead.next_followup_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sheets.updateLead(lead);

    res.json({
      success: true,
      isNewLead,
      lead_id: lead.lead_id,
      greeting: greeting,
      note: 'SMS not sent in test mode'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
async function start() {
  try {
    await sheets.init();
    twilio.init();

    app.listen(PORT, () => {
      console.log(`\nLeadPilot server running on port ${PORT}`);
      console.log('\nEndpoints:');
      console.log(`  Twilio SMS:       POST http://localhost:${PORT}/webhook/sms`);
      console.log(`  GoTo Missed Call: POST http://localhost:${PORT}/webhook/goto-missed-call`);
      console.log(`  Test SMS:         POST http://localhost:${PORT}/test/sms`);
      console.log(`  Test Missed Call: POST http://localhost:${PORT}/test/missed-call`);
      console.log(`  Health:           GET  http://localhost:${PORT}/health\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
