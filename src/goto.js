const GOTO_API_BASE = 'https://api.goto.com';
const GOTO_AUTH_URL = 'https://authentication.logmeininc.com/oauth/token';

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const clientId = process.env.GOTO_CLIENT_ID;
  const clientSecret = process.env.GOTO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GoTo credentials not configured');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(GOTO_AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GoTo auth failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log('GoTo access token refreshed');
  return cachedToken;
}

async function sendSMS(to, message) {
  const token = await getAccessToken();
  const fromNumber = process.env.GOTO_PHONE_NUMBER;

  if (!fromNumber) {
    console.log(`[MOCK GoTo SMS] To: ${to}, Message: ${message}`);
    return { status: 'mock' };
  }

  const response = await fetch(`${GOTO_API_BASE}/messaging/v1/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ownerPhoneNumber: fromNumber,
      contactPhoneNumbers: [to],
      body: message
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GoTo SMS failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log(`GoTo SMS sent to ${to}`);
  return data;
}

function parseCallEvent(webhookData) {
  // Extract relevant info from GoTo call event webhook
  // Structure varies based on event type (STARTING, ACTIVE, ENDING)

  const event = {
    conversationId: webhookData.conversationSpaceId,
    direction: webhookData.direction, // INBOUND or OUTBOUND
    callCreated: webhookData.callCreated,
    callEnded: webhookData.callEnded,
    participants: webhookData.participants || [],
    eventType: webhookData.eventType // STARTING, ACTIVE, ENDING
  };

  // Find the external caller (not internal extension)
  const externalParticipant = event.participants.find(p => {
    // External callers typically have phone numbers, not extension numbers
    return p.type?.value?.startsWith('+') ||
           (p.type?.value && !p.type?.extensionNumber);
  });

  if (externalParticipant) {
    event.callerPhone = externalParticipant.type?.value;
    event.callerName = externalParticipant.type?.name;
  }

  return event;
}

function isMissedCall(event) {
  // A missed call is an INBOUND call where no participant reached CONNECTED status
  if (event.direction !== 'INBOUND') {
    return false;
  }

  // Check if any internal participant (agent) connected
  const anyConnected = event.participants.some(p => {
    return p.status === 'CONNECTED' || p.previousStatus === 'CONNECTED';
  });

  // If call has ended and nobody connected, it's a missed call
  if (event.eventType === 'ENDING' && !anyConnected) {
    return true;
  }

  return false;
}

function isConfigured() {
  return !!(process.env.GOTO_CLIENT_ID && process.env.GOTO_CLIENT_SECRET);
}

module.exports = {
  getAccessToken,
  sendSMS,
  parseCallEvent,
  isMissedCall,
  isConfigured
};
