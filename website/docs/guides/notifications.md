---
title: Notifications
sidebar_position: 9
---

# Notifications

Configure Slack and Discord notifications to receive alerts when events occur in your Bellwether Cloud projects.

## Overview

Bellwether can send notifications to:

- **Slack** - Via incoming webhooks or Slack App
- **Discord** - Via incoming webhooks

Notifications are triggered by the same events as webhooks:

| Event | Description |
|:------|:------------|
| `baseline.uploaded` | A new baseline was uploaded |
| `baseline.drift_detected` | Behavioral drift was detected |
| `baseline.security_finding` | Security issues were found |

## Slack Integration

### Using Incoming Webhooks

1. Create a Slack webhook:
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Create or select an app
   - Enable **Incoming Webhooks**
   - Add a webhook to your workspace
   - Copy the webhook URL

2. Configure in Bellwether:
   - Go to your project in the dashboard
   - Navigate to **Settings** > **Integrations**
   - Click **Add Notification Channel**
   - Select **Slack**
   - Paste your webhook URL
   - Select events to notify on
   - Click **Save**

### Notification Format

Slack notifications include rich formatting:

```
Bellwether: Drift Detected

Project: my-mcp-server
Severity: Breaking

Changes:
- Tool added: new_helper_tool
- Tool modified: execute_command (schema changed)

1 breaking change, 2 warnings

View diff: https://bellwether.sh/projects/proj_abc/diff/11/12
```

### Channel Selection

Specify which Slack channel receives notifications by configuring your webhook to post to a specific channel, or use different webhooks for different event types:

```
#alerts - Security findings (high priority)
#builds - Baseline uploads and drift (informational)
```

---

## Discord Integration

### Using Webhooks

1. Create a Discord webhook:
   - Open your Discord server
   - Go to **Server Settings** > **Integrations** > **Webhooks**
   - Click **New Webhook**
   - Select the channel
   - Copy the webhook URL

2. Configure in Bellwether:
   - Go to your project in the dashboard
   - Navigate to **Settings** > **Integrations**
   - Click **Add Notification Channel**
   - Select **Discord**
   - Paste your webhook URL
   - Select events to notify on
   - Click **Save**

### Notification Format

Discord notifications use rich embeds:

```
Bellwether: Security Finding

Project: my-mcp-server
Version: 12

Findings:
- HIGH: Potential command injection in execute_command
- MEDIUM: Unvalidated input in read_file

View baseline: https://bellwether.sh/projects/proj_abc/baselines/12
```

Embed colors indicate severity:
- Green: Upload successful
- Yellow: Drift detected (warnings)
- Red: Breaking changes or security findings

---

## Configuration Options

### Event Filtering

Choose which events trigger notifications:

| Event | Recommended For |
|:------|:----------------|
| `baseline.uploaded` | Audit trail, deployment tracking |
| `baseline.drift_detected` | Change awareness, review triggers |
| `baseline.security_finding` | Security alerts (high priority) |

### Multiple Channels

You can configure multiple notification channels:

```
Channel 1: Slack #ops
  Events: baseline.drift_detected, baseline.security_finding

Channel 2: Discord #mcp-updates
  Events: baseline.uploaded

Channel 3: Slack #security
  Events: baseline.security_finding
```

---

## Managing Notifications

### Via Dashboard

1. Go to **Settings** > **Integrations**
2. Find your notification channel
3. Click **Edit** to modify settings
4. Click **Delete** to remove

### Test Notifications

Send a test notification to verify your setup:

1. Go to notification channel settings
2. Click **Send Test**
3. Verify the message appears in your Slack/Discord channel

---

## Notification Frequency

Bellwether sends notifications in real-time as events occur. There is no batching or digest mode.

To reduce notification volume:
- Filter to only high-priority events (`baseline.security_finding`)
- Use webhooks instead for programmatic processing
- Configure branch filters in CI to limit uploads

---

## Availability

| Feature | Free Plan | Solo Plan | Team Plan |
|:--------|:----------|:----------|:----------|
| Slack notifications | - | - | Yes |
| Discord notifications | - | - | Yes |
| Channels per project | - | - | Unlimited |

Slack and Discord notifications are available on the Team plan. Solo plan users can use [webhooks](/guides/webhooks) to receive notifications via custom integrations.

---

## Troubleshooting

### Notifications Not Arriving

1. **Verify webhook URL** - Test the URL directly with curl
2. **Check event selection** - Ensure the event type is enabled
3. **Review channel permissions** - Ensure the webhook can post to the channel
4. **Check rate limits** - Slack/Discord may rate limit excessive notifications

### Testing Webhook URL

```bash
# Slack
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test from Bellwether"}' \
  YOUR_SLACK_WEBHOOK_URL

# Discord
curl -X POST -H 'Content-type: application/json' \
  --data '{"content":"Test from Bellwether"}' \
  YOUR_DISCORD_WEBHOOK_URL
```

### Invalid Webhook URL

Ensure your webhook URL is:
- Using HTTPS
- Not expired (Slack webhooks don't expire, but can be revoked)
- Correctly copied (no extra spaces or characters)

---

## See Also

- [Webhooks](/guides/webhooks) - Custom webhook integrations
- [Cloud Integration](/guides/cloud-integration) - Cloud features overview
- [GitHub & GitLab](/guides/github-gitlab) - CI/CD integration
