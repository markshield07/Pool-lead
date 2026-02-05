# Pool Lead Autopilot

An agentic workflow system that helps pool cleaning businesses capture, qualify, and book leads automatically.

## Project Overview

**Purpose**: 24/7 Lead Capture → Qualification → Booking Agent

**Target**: Local pool cleaning service businesses

**Core Promise**: "Never miss another pool lead again"

This is NOT a chatbot or FAQ bot. This is a **revenue agent** whose only job is to:
- **Capture** leads from multiple channels
- **Qualify** leads automatically
- **Book** jobs on the calendar
- **Follow up** consistently

## Tech Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Agent Brain | Claude Code | Decision logic + message generation |
| Orchestrator | n8n | Workflow automation, webhooks, routing |
| SMS | Twilio | Inbound/outbound text messaging |
| Calendar | Google Calendar | Booking and availability |
| CRM/State | Google Sheets | Lead storage, conversation history, config |

## Agent Behavior Rules

### Tone
- Friendly, local, professional
- Short messages (1-2 sentences max)
- No emojis unless natural
- Feels human, not robotic

### Logic Rules
1. **Respond instantly** - seconds, not hours
2. **Ask one question at a time** - unless offering multiple choice
3. **Check service area first** - filter out-of-area leads early
4. **Give price ranges only** - never exact pricing unless configured
5. **Handoff when uncertain** - if confused or human requested, escalate
6. **Never promise** what can't be delivered
7. **Always output valid JSON** - no extra text, strict format

### Guardrails
- Never upsell aggressively
- Always stay polite
- Hand off edge cases to owner
- No spam in follow-ups

## Conversation Flow

### Step 1: Instant Response
```
"Hey! Thanks for reaching out. I help schedule pool cleanings for [Company Name].
I can get you a quote or book service — just a few quick questions."
```

### Step 2: Service Area Check (Filter #1)
```
"What city is the pool located in?"
```
- If outside service area → polite decline + referral
- If inside → continue

### Step 3: Pool Type (Filter #2)
```
"Is this a residential or commercial pool?"
```
- If commercial and unsupported → route to owner
- Otherwise → continue

### Step 4: Pool Details
```
"About how big is the pool? (standard backyard / large / not sure)"
```
Optional: "Is it currently green or mostly clear?"

### Step 5: Service Type (Intent Check)
```
"What are you looking for right now?"
- Weekly service
- Bi-weekly service
- One-time clean
- Just getting a quote
```

### Step 6: Soft Pricing
```
"Thanks! For pools like yours, pricing usually falls between $140–$180/month
depending on service frequency and condition."
```

### Step 7: Booking Offer
```
"If you'd like, I can get you on the schedule for a quick visit or start service.
What works better for you?"
```

### Step 8: Calendar Confirmation
```
"You're all set! We've scheduled you for [date/time].
You'll get a reminder before the visit."
```

### Step 9: Follow-Up Sequence (if not booked)
- **Day 1**: "Just checking in — happy to get you a quote or answer questions."
- **Day 3**: "We have a few openings this week if you want to get started."
- **Day 7**: "No pressure — just let me know if you'd like help with your pool."

## Data Model (Google Sheets)

### Leads Table
| Column | Type | Description |
|--------|------|-------------|
| lead_id | uuid | Unique identifier |
| phone | string | Contact number |
| name | string | Lead name |
| city | string | Pool location |
| address | string | Full address |
| pool_type | enum | residential / commercial |
| pool_size | enum | standard / large / unknown |
| pool_condition | enum | clear / green / unknown |
| service_type | enum | weekly / biweekly / one-time / quote |
| status | enum | new / qualifying / qualified / booked / unqualified / handoff |
| last_message_at | datetime | Last interaction |
| next_followup_at | datetime | Scheduled follow-up |
| notes | string | Additional info |

### Messages Table
| Column | Type | Description |
|--------|------|-------------|
| lead_id | uuid | Reference to lead |
| timestamp | datetime | Message time |
| direction | enum | in / out |
| text | string | Message content |

### Config Table (Key/Value)
| Key | Example Value |
|-----|---------------|
| business_name | "Crystal Clear Pools" |
| service_cities | "Phoenix, Scottsdale, Tempe" |
| pricing_weekly_range | "$140-$180/month" |
| pricing_biweekly_range | "$90-$120/month" |
| pricing_onetime_range | "$150-$300" |
| booking_type | "estimate" or "service" |
| handoff_phone | "+1234567890" |
| office_hours | "9am-5pm" |

## Claude Output Contract (JSON Schema)

Every Claude response MUST be valid JSON in this format:

```json
{
  "reply_text": "The message to send to the customer",
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
  "missing_fields": ["city", "service_type"],
  "booking_request": {
    "preferred_days": null,
    "preferred_times": null
  },
  "handoff_reason": null
}
```

### Field Definitions
- **reply_text**: What the customer sees
- **lead_status**: Current qualification state
- **intent**: Next action type
- **fields_extracted**: Data collected from conversation
- **missing_fields**: Required fields still needed
- **booking_request**: Scheduling preferences if expressed
- **handoff_reason**: Why escalation needed (if applicable)

## System Prompt

```
You are a scheduling assistant for a local pool cleaning company.
Goal: convert inquiries into booked appointments or qualified leads.

Rules:
- Be brief, friendly, professional. 1–2 short messages max.
- Ask only one question at a time unless it's a multiple-choice list.
- Always check service city first. If outside service area: politely decline.
- Give price ranges only (unless config explicitly says exact pricing).
- If uncertain, confused, or customer requests a human: set intent=handoff.
- Output MUST be valid JSON only (no extra text).

You will receive:
- config (service cities, price ranges, booking type, office hours)
- last 10 messages
- latest inbound message
- current lead record

Decide next best action and return JSON with:
reply_text, lead_status, intent, fields_extracted, missing_fields, booking_request, handoff_reason.
```

## n8n Workflow Structure

### Workflow 1: Inbound SMS Handler
1. **Webhook** - Receive Twilio inbound SMS
2. **Lookup Lead** - Find or create lead in Sheets
3. **Append Message** - Log inbound message
4. **Get History** - Load last 10 messages
5. **Get Config** - Load business rules
6. **Claude Call** - Get decision + response
7. **Parse JSON** - Validate response
8. **Update Lead** - Save extracted fields
9. **Router** - Branch by intent
10. **Send SMS** - Reply via Twilio
11. **Log Outbound** - Save sent message

### Workflow 2: Follow-Up Scheduler
1. **Cron** - Run hourly
2. **Find Due Leads** - Query next_followup_at <= now
3. **Claude Call** - Generate follow-up message
4. **Send SMS** - Deliver follow-up
5. **Update Next** - Set next follow-up (Day 1 → Day 3 → Day 7)

### Workflow 3: Booking Flow
1. **Check Calendar** - FreeBusy for next 7 days
2. **Offer Slots** - Present 2-3 options
3. **Create Event** - Book confirmed slot
4. **Send Confirmation** - SMS with details
5. **Update Status** - Mark lead as booked

## Development Commands

```bash
# Start n8n locally
n8n start

# Test Twilio webhook locally (use ngrok)
ngrok http 5678

# Validate JSON output
echo '{"reply_text":"test"}' | jq .
```

## Entry Points (Lead Sources)

1. **SMS** - Twilio inbound number
2. **Website Form** - Webhook to n8n
3. **Google Business Messages** - Via integration
4. **Facebook/Instagram DMs** - Via GHL or direct API
5. **Missed Calls** - Twilio → auto-text back

## Owner Notifications

Owner gets notified ONLY when:
- A job is booked
- A hot lead requests human help
- Commercial or edge case appears

Keep trust high by not over-notifying.
