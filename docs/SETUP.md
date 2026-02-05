# Pool Lead Autopilot - Setup Guide

Complete setup guide for deploying the Pool Lead Autopilot on your Raspberry Pi with n8n.

---

## Prerequisites

- n8n self-hosted on Raspberry Pi (already done!)
- Google account
- Claude API key (from console.anthropic.com)
- Twilio account (we'll set this up)

---

## Step 1: Set Up Twilio (10 minutes)

### 1.1 Create Account
1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a free trial
3. Verify your email and phone number

### 1.2 Get a Phone Number
1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Buy a number**
2. Search for a number in your area code
3. Click **Buy** (~$1/month)
4. Save this number - this is your `twilio_number`

### 1.3 Get API Credentials
1. Go to **Account** → **API keys & tokens**
2. Copy your **Account SID**
3. Copy your **Auth Token**
4. Save these for n8n

### 1.4 Configure Webhook (do this AFTER n8n setup)
1. Go to **Phone Numbers** → **Manage** → **Active numbers**
2. Click on your number
3. Scroll to **Messaging Configuration**
4. Set "A message comes in" webhook to:
   ```
   https://YOUR-N8N-URL/webhook/pool-lead-sms
   ```
5. Method: HTTP POST
6. Click **Save**

---

## Step 2: Set Up Google Sheets

### 2.1 Create the Spreadsheet
Follow the instructions in `/templates/google-sheets-setup.md` to create:
- **Leads** sheet (track customers)
- **Messages** sheet (conversation history)
- **Config** sheet (your business rules)

### 2.2 Get the Spreadsheet ID
From your Google Sheets URL:
```
https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
```
Copy the `SPREADSHEET_ID` part.

---

## Step 3: Set Up n8n Credentials

### 3.1 Access n8n
Open your n8n instance (usually `http://raspberrypi.local:5678` or your Pi's IP)

### 3.2 Add Google Sheets Credential
1. Go to **Settings** → **Credentials** → **Add Credential**
2. Search for "Google Sheets"
3. Select **OAuth2** method
4. Click **Sign in with Google**
5. Authorize access to Google Sheets
6. Name it: `Google Sheets`

### 3.3 Add Twilio Credential
1. Go to **Settings** → **Credentials** → **Add Credential**
2. Search for "Twilio"
3. Enter:
   - Account SID
   - Auth Token
4. Name it: `Twilio`

### 3.4 Add Claude API Credential
1. Go to **Settings** → **Credentials** → **Add Credential**
2. Search for "Header Auth"
3. Enter:
   - Name: `x-api-key`
   - Value: `your-claude-api-key`
4. Name it: `Anthropic API`

---

## Step 4: Import Workflows

### 4.1 Import Inbound SMS Handler
1. Go to **Workflows** → **Import from File**
2. Select `workflows/inbound-sms-handler.json`
3. Click **Import**

### 4.2 Import Follow-up Scheduler
1. Go to **Workflows** → **Import from File**
2. Select `workflows/followup-scheduler.json`
3. Click **Import**

### 4.3 Update Credential References
In each workflow, update the credential references:
1. Click on each Google Sheets node
2. Select your `Google Sheets` credential
3. Enter your Spreadsheet ID
4. Click on Twilio nodes → select `Twilio` credential
5. Click on HTTP Request (Claude) nodes → select `Anthropic API` credential

---

## Step 5: Configure Webhook URL

### 5.1 Get Your n8n Webhook URL
Your webhook URL format:
```
http://[YOUR-PI-IP]:5678/webhook/pool-lead-sms
```

### 5.2 Make It Public (Required for Twilio)

**Option A: Use ngrok (easiest for testing)**
```bash
# Install ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Run ngrok
ngrok http 5678
```
Copy the `https://xxxx.ngrok.io` URL.

**Option B: Use Cloudflare Tunnel (free, permanent)**
```bash
# Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm.deb
sudo dpkg -i cloudflared.deb

# Create tunnel
cloudflared tunnel login
cloudflared tunnel create n8n-tunnel
cloudflared tunnel route dns n8n-tunnel your-subdomain.yourdomain.com
```

**Option C: Port forwarding + Dynamic DNS**
- Forward port 5678 on your router
- Use a dynamic DNS service like DuckDNS

### 5.3 Update Twilio Webhook
Go back to Twilio Console → Your Number → Set webhook to your public URL:
```
https://your-public-url/webhook/pool-lead-sms
```

---

## Step 6: Activate Workflows

1. Open **Inbound SMS Handler** workflow
2. Click **Active** toggle (top right) → ON
3. Open **Follow-up Scheduler** workflow
4. Click **Active** toggle → ON

---

## Step 7: Test It!

### 7.1 Send a Test SMS
Text your Twilio number:
```
Hi, I need pool cleaning
```

### 7.2 Check Results
1. Check your phone - you should get a reply
2. Check Google Sheets - new lead should appear
3. Check n8n execution log for any errors

---

## Troubleshooting

### "Webhook not receiving messages"
- Verify Twilio webhook URL is correct
- Check n8n is running: `sudo systemctl status n8n`
- Test webhook directly: `curl -X POST your-webhook-url`

### "Google Sheets errors"
- Re-authorize Google credential in n8n
- Verify spreadsheet ID is correct
- Check sheet names match exactly (Leads, Messages, Config)

### "Claude API errors"
- Verify API key is correct
- Check you have credits at console.anthropic.com
- Look at the raw response in n8n execution log

### "SMS not sending"
- Check Twilio account has credits
- Verify phone numbers are in E.164 format (+15551234567)
- Check Twilio logs for errors

---

## Costs Estimate

| Service | Cost |
|---------|------|
| Twilio Phone Number | ~$1/month |
| Twilio SMS (inbound) | Free |
| Twilio SMS (outbound) | ~$0.0079/message |
| Claude API | ~$0.003/1K input tokens, $0.015/1K output |
| Google Sheets | Free |
| n8n (self-hosted) | Free |

**Estimated monthly cost for 100 leads**: ~$5-15

---

## Next Steps

1. Customize the Config sheet with your actual business details
2. Adjust pricing ranges to match your services
3. Add your service cities
4. Test with a few real leads
5. Monitor and adjust the system prompt if needed

---

## Support

If you run into issues:
1. Check n8n execution logs
2. Check Twilio logs
3. Verify all credentials are correctly configured
4. Test each node individually in n8n
