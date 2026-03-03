const twilio = require('twilio');

let client = null;

function init() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('Twilio credentials not set - SMS sending disabled');
    return;
  }

  client = twilio(accountSid, authToken);
  console.log('Twilio client initialized');
}

async function sendSMS(to, message) {
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!client) {
    console.log(`[MOCK SMS] To: ${to}, Message: ${message}`);
    return { sid: 'mock_' + Date.now(), status: 'mock' };
  }

  const result = await client.messages.create({
    body: message,
    from: from,
    to: to
  });

  console.log(`SMS sent to ${to}: ${result.sid}`);
  return result;
}

async function notifyOwner(phone, reason, lastMessage, config) {
  const handoffPhone = config.handoff_phone;

  if (!handoffPhone) {
    console.log('No handoff phone configured - skipping owner notification');
    return;
  }

  const message = `LEAD NEEDS ATTENTION

Phone: ${phone}
Reason: ${reason || 'Customer requested human'}
Last message: ${lastMessage}`;

  await sendSMS(handoffPhone, message);
}

module.exports = { init, sendSMS, notifyOwner };
