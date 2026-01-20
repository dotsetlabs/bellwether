---
title: Webhooks
sidebar_position: 7
---

# Webhooks

Configure webhooks to receive notifications when events occur in your Bellwether Cloud projects.

## Overview

Webhooks send HTTP POST requests to your specified URL when events occur, such as:

- New baseline uploaded
- Behavioral drift detected
- Security findings discovered

This enables integrations with CI/CD pipelines, chat systems, monitoring tools, and custom automation.

## Event Types

| Event | Description |
|:------|:------------|
| `baseline.uploaded` | A new baseline was uploaded to the project |
| `baseline.drift_detected` | Behavioral drift was detected between baselines |
| `baseline.security_finding` | Security issues were found in a baseline |

## Creating a Webhook

### Via Dashboard

1. Navigate to your project in the Bellwether dashboard
2. Go to **Settings** > **Integrations**
3. Click **Add Webhook**
4. Enter your webhook URL (must be HTTPS)
5. Select the events you want to receive
6. Click **Create**

### Via API

```bash
curl -X POST "https://api.bellwether.sh/projects/proj_abc123/webhooks" \
  -H "Authorization: Bearer $BELLWETHER_SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks/bellwether",
    "events": ["baseline.uploaded", "baseline.drift_detected"]
  }'
```

Response includes the webhook secret for signature verification:

```json
{
  "webhook": {
    "id": "wh_xyz789",
    "url": "https://your-server.com/webhooks/bellwether",
    "events": ["baseline.uploaded", "baseline.drift_detected"],
    "enabled": true,
    "createdAt": "2026-01-15T10:00:00.000Z"
  },
  "secret": "whsec_abc123..."
}
```

**Important:** Store the secret securely. It's only shown once at creation time.

## Webhook Payload

All webhook payloads follow this structure:

```json
{
  "event": "baseline.drift_detected",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "project": {
    "id": "proj_abc123",
    "name": "my-mcp-server"
  },
  "data": {
    // Event-specific data
  }
}
```

### baseline.uploaded

```json
{
  "event": "baseline.uploaded",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "project": {
    "id": "proj_abc123",
    "name": "my-mcp-server"
  },
  "data": {
    "version": 12,
    "hash": "a1b2c3d4",
    "toolCount": 5,
    "serverName": "my-server",
    "cliVersion": "0.6.0"
  }
}
```

### baseline.drift_detected

```json
{
  "event": "baseline.drift_detected",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "project": {
    "id": "proj_abc123",
    "name": "my-mcp-server"
  },
  "data": {
    "fromVersion": 11,
    "toVersion": 12,
    "severity": "breaking",
    "changes": {
      "toolsAdded": ["new_tool"],
      "toolsRemoved": [],
      "toolsModified": ["existing_tool"],
      "breakingCount": 1,
      "warningCount": 2
    }
  }
}
```

### baseline.security_finding

```json
{
  "event": "baseline.security_finding",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "project": {
    "id": "proj_abc123",
    "name": "my-mcp-server"
  },
  "data": {
    "version": 12,
    "findings": [
      {
        "severity": "high",
        "category": "injection",
        "tool": "execute_command",
        "description": "Potential command injection vulnerability"
      }
    ]
  }
}
```

## Signature Verification

All webhook requests include a signature header for verification:

```
X-Bellwether-Signature: sha256=abc123...
```

### Verifying in Node.js

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express middleware example
app.post('/webhooks/bellwether', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-bellwether-signature'];
  const payload = req.body.toString();

  if (!verifyWebhookSignature(payload, signature, process.env.BELLWETHER_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(payload);
  // Process event...

  res.status(200).send('OK');
});
```

### Verifying in Python

```python
import hmac
import hashlib

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode('utf-8'),
        payload,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected)
```

## Retry Policy

Bellwether retries failed webhook deliveries with exponential backoff:

| Attempt | Delay |
|:--------|:------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After 5 failed attempts, the delivery is marked as failed.

## Delivery History

View webhook delivery history in the dashboard:

1. Go to your project's **Settings** > **Integrations**
2. Click on a webhook
3. View the **Deliveries** tab

Each delivery shows:
- Timestamp
- Event type
- HTTP status code
- Response time
- Request/response bodies (for debugging)

## Testing Webhooks

### Send a Test Event

From the dashboard:

1. Go to webhook settings
2. Click **Send Test**
3. Select an event type
4. Verify your endpoint receives it

### Via API

```bash
curl -X POST "https://api.bellwether.sh/webhooks/wh_xyz789/test" \
  -H "Authorization: Bearer $BELLWETHER_SESSION"
```

### Local Development

Use a tunneling service like ngrok for local testing:

```bash
ngrok http 3000
# Use the ngrok URL as your webhook endpoint
```

## Managing Webhooks

### Update Webhook

```bash
curl -X PATCH "https://api.bellwether.sh/webhooks/wh_xyz789" \
  -H "Authorization: Bearer $BELLWETHER_SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://new-url.com/webhook",
    "events": ["baseline.drift_detected"],
    "enabled": true
  }'
```

### Disable Webhook

```bash
curl -X PATCH "https://api.bellwether.sh/webhooks/wh_xyz789" \
  -H "Authorization: Bearer $BELLWETHER_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Delete Webhook

```bash
curl -X DELETE "https://api.bellwether.sh/webhooks/wh_xyz789" \
  -H "Authorization: Bearer $BELLWETHER_SESSION"
```

### Retrieve Secret

If you need to retrieve your webhook secret:

```bash
curl "https://api.bellwether.sh/webhooks/wh_xyz789/secret" \
  -H "Authorization: Bearer $BELLWETHER_SESSION"
```

## Limits

| Tier | Webhooks per Project |
|:-----|:--------------------|
| Free | None |
| Solo | Unlimited |
| Team | Unlimited |

## Best Practices

1. **Always verify signatures** - Never trust webhook payloads without verification
2. **Respond quickly** - Return 200 within 30 seconds to avoid timeout retries
3. **Process asynchronously** - Queue webhook processing for reliability
4. **Handle duplicates** - Webhooks may be retried; use idempotency keys
5. **Use HTTPS** - Webhook URLs must use HTTPS for security

## See Also

- [Cloud Integration](/guides/cloud-integration) - Overview of cloud features
- [Notifications](/guides/notifications) - Slack and Discord notifications
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup
