// GoTo Call Event Parser
// Only used for missed call detection - SMS handled by Twilio

function parseCallEvent(webhookData) {
  // Extract relevant info from GoTo call event webhook
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

module.exports = {
  parseCallEvent,
  isMissedCall
};
