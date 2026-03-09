const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

async function getResponse(lead, messages, config, inboundText) {
  const apiKey = process.env.CLAUDE_API_KEY;

  // Build conversation history
  const conversationHistory = messages
    .map(m => `${m.direction === 'in' ? 'Customer' : 'Agent'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `You are a scheduling assistant for a local pool cleaning company.

GOAL: Convert inquiries into booked appointments or qualified leads.

BUSINESS CONFIG:
- Business Name: ${config.business_name || 'Pool Cleaning Co'}
- Service Cities: ${config.service_cities || 'Not configured'}
- Weekly Pricing: ${config.pricing_weekly_range || '$140-$180/month'}
- Bi-weekly Pricing: ${config.pricing_biweekly_range || '$90-$120/month'}
- One-time Pricing: ${config.pricing_onetime_range || '$150-$300'}
- Office Hours: ${config.office_hours || '9am-5pm'}

RULES:
1. Be brief and friendly (1-2 sentences max)
2. Ask ONE question at a time
3. Check service city FIRST - politely decline if outside area
4. Give price RANGES only, never exact pricing
5. If uncertain or customer requests human: set intent=handoff
6. Output MUST be valid JSON only - no extra text

QUALIFICATION FLOW:
1. Greet + ask city
2. Confirm residential vs commercial
3. Ask pool size (standard/large/not sure)
4. Ask service needed (weekly/biweekly/one-time/quote)
5. Provide pricing range
6. Offer to book

OUTPUT FORMAT (strict JSON):
{
  "reply_text": "Your message to send",
  "lead_status": "new|qualifying|qualified|booked|unqualified|handoff",
  "intent": "ask_question|give_pricing|book|follow_up|handoff",
  "fields_extracted": {
    "name": null,
    "city": null,
    "address": null,
    "pool_type": null,
    "pool_size": null,
    "pool_condition": null,
    "service_type": null
  },
  "missing_fields": ["city", "pool_type"],
  "booking_request": {
    "preferred_days": null,
    "preferred_times": null
  },
  "handoff_reason": null
}`;

  const userMessage = `CURRENT LEAD RECORD:
${JSON.stringify(lead, null, 2)}

CONVERSATION HISTORY:
${conversationHistory || '(new conversation)'}

NEW MESSAGE FROM CUSTOMER:
${inboundText}

Respond with JSON only.`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Parse JSON response
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback response
      parsed = {
        reply_text: 'Thanks for reaching out! Someone will get back to you shortly.',
        lead_status: lead.status || 'new',
        intent: 'handoff',
        fields_extracted: {},
        missing_fields: [],
        booking_request: {},
        handoff_reason: 'Failed to parse AI response'
      };
    }
  }

  console.log('Claude response:', parsed.reply_text);
  return parsed;
}

module.exports = { getResponse };
