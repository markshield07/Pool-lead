# Google Sheets Setup Guide

Create a new Google Sheet and set up the following three tabs (sheets).

## Sheet 1: Leads

Create a sheet named **Leads** with these columns:

| Column | Description | Example |
|--------|-------------|---------|
| lead_id | Unique identifier | `1_1704067200000` |
| phone | Customer phone number | `+15551234567` |
| name | Customer name | `John Smith` |
| city | Pool location city | `Phoenix` |
| address | Full address | `123 Main St` |
| pool_type | residential or commercial | `residential` |
| pool_size | standard, large, or unknown | `standard` |
| pool_condition | clear, green, or unknown | `clear` |
| service_type | weekly, biweekly, one-time, or quote | `weekly` |
| status | Lead status | `qualifying` |
| last_message_at | Last interaction timestamp | `2024-01-01T12:00:00Z` |
| next_followup_at | When to follow up | `2024-01-02T12:00:00Z` |
| notes | Additional notes | `Referred by neighbor` |

### Status Values:
- `new` - Just started conversation
- `qualifying` - Gathering information
- `qualified` - Ready to book
- `booked` - Appointment scheduled
- `unqualified` - Not a fit (out of area, etc.)
- `handoff` - Needs human attention

---

## Sheet 2: Messages

Create a sheet named **Messages** with these columns:

| Column | Description | Example |
|--------|-------------|---------|
| lead_id | Reference to Leads table | `1_1704067200000` |
| timestamp | Message timestamp | `2024-01-01T12:00:00Z` |
| direction | in or out | `in` |
| text | Message content | `Hi, I need pool service` |

---

## Sheet 3: Config

Create a sheet named **Config** with two columns: **key** and **value**

Add these rows:

| key | value |
|-----|-------|
| business_name | Crystal Clear Pools |
| service_cities | Phoenix, Scottsdale, Tempe, Mesa, Chandler |
| pricing_weekly_range | $140-$180/month |
| pricing_biweekly_range | $90-$120/month |
| pricing_onetime_range | $150-$300 |
| pricing_green_pool | $200-$400 (depends on condition) |
| booking_type | estimate |
| handoff_phone | +15559876543 |
| twilio_number | +15551112222 |
| office_hours | 9am-5pm Mon-Fri |

### Config Key Descriptions:

- **business_name**: Your company name (used in greetings)
- **service_cities**: Comma-separated list of cities you serve
- **pricing_weekly_range**: Price range for weekly service
- **pricing_biweekly_range**: Price range for bi-weekly service
- **pricing_onetime_range**: Price range for one-time cleaning
- **pricing_green_pool**: Price range for green pool cleanup
- **booking_type**: "estimate" (schedule visit first) or "service" (book directly)
- **handoff_phone**: Owner's phone number for notifications
- **twilio_number**: Your Twilio phone number
- **office_hours**: Business hours (for reference)

---

## Quick Setup Steps

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Rename it to "Pool Lead Autopilot"
4. Create three sheets (tabs at bottom): Leads, Messages, Config
5. Add the column headers to each sheet
6. Fill in the Config sheet with your business details
7. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS-IS-YOUR-SHEET-ID]/edit
   ```
8. Save this ID - you'll need it for n8n

---

## Sample Data (Optional)

You can add a test lead to verify the workflow:

**Leads sheet:**
```
lead_id: test_001
phone: +15551234567
name: Test User
city: Phoenix
status: new
```

**Messages sheet:**
```
lead_id: test_001
timestamp: 2024-01-01T12:00:00Z
direction: in
text: Hi, I need pool cleaning
```
