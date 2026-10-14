# Commute Disruption Alerts & Background Processing Setup

## Overview

The Commute Disruption Alerting & Processing subsystem proactively detects, manages, and delivers personalized transit disruption alerts for students navigating the Mumbai Metropolitan Region transit network.

This document describes the environment configuration, background scheduler integration, data provenance distinctions, channel fallback behavior, and API contract specifications.

---

## 1. Unified Background Scheduler Integration

To avoid creating duplicate schedulers or uncontrolled polling loops, commute alert processing is directly integrated into the repository's existing background scheduler: `ReminderScheduler` (`backend/services/reminderScheduler.js`).

### How It Works:
- **Single Scheduler Loop**: `ReminderScheduler.prototype.startScheduler({ intervalMs })` runs a single `setInterval` timer (default: `60,000ms` / 1 minute).
- **Sequential Tick Execution**:
  1. `processDueReminders()`: transitions due calendar/routine reminders to triggered and generates student notifications.
  2. `processCommuteDisruptionAlerts()`: delegates to `CommuteAlertProcessingService.runProcessingJob({ trigger: 'scheduled' })`.
- **Concurrency & Idempotency Safeguards**:
  - `isProcessing` flag guarantees that overlapping ticks will not run concurrent processing jobs.
  - Deterministic fingerprinting (`alert-fp:user:disruption:corridor:category`) prevents duplicate alerts for identical disruptions.
  - Delivery idempotency keys (`deliver:userId:alertId:channel`) prevent duplicate notification sends across multiple ticks.

---

## 2. Environment Variables

All external feeds and third-party delivery channels degrade gracefully if unconfigured. The system will **never** pretend a live feed or push worker is operational when credentials or endpoints are absent.

| Environment Variable | Type | Default | Description |
|---|---|---|---|
| `GTFS_RT_ALERTS_URL` | String (URL) | `undefined` | Live transit feed URL (GTFS-RT ServiceAlerts protobuf/JSON). When omitted or set to test, system operates in local database & crowdsourced mode. |
| `ALERT_SCHEDULER_INTERVAL_MS` | Integer | `60000` | Background scheduler interval in milliseconds. |
| `SMTP_HOST` | String | `undefined` | SMTP server host for external email alert delivery. |
| `SMTP_PORT` | Integer | `587` | SMTP server port. |
| `SMTP_USER` | String | `undefined` | SMTP authentication username. |
| `SMTP_PASS` | String | `undefined` | SMTP authentication password (redacted from logs). |
| `SENDGRID_API_KEY` | String | `undefined` | Alternative SendGrid API key for email delivery. |
| `VAPID_PUBLIC_KEY` | String | `undefined` | VAPID public key for Browser Web Push. |
| `VAPID_PRIVATE_KEY` | String | `undefined` | VAPID private key for Browser Web Push. |
| `VAPID_SUBJECT` | String | `undefined` | Contact URI / mailto for Web Push identification. |

---

## 3. Delivery Channels & Safe Fallback Mechanics

Students configure their preferred delivery channels via `PUT /api/commute/alerts/preferences`. The system evaluates channel prerequisites honestly:

1. **In-App (`in_app`)**:
   - Status: **Always Configured & Authoritative**.
   - Backed by persistent SQLite notifications inbox (`notifications` table).
   - Serves as the guaranteed fallback channel if any external channel is unconfigured or fails.
2. **WebSocket (`socket`)**:
   - Status: Configured when Socket.IO server is attached.
   - Emits alerts to private student rooms (`user:${userId}`).
   - Privacy Invariant: Personalized commute alerts are **never** emitted to public rooms.
3. **Email (`email`)**:
   - Status: Configured when `SMTP_HOST` or `SENDGRID_API_KEY` is present.
   - If unconfigured, the delivery attempt is recorded as `UNCONFIGURED` and automatically falls back to an in-app notification.
4. **Browser Web Push (`push`)**:
   - Status: Disabled / unconfigured by default until VAPID keys and client service worker push subscriptions are registered.
   - Never claimed to be operational unless actual VAPID prerequisites are met. Automatically falls back to in-app.

---

## 4. Provenance & Data Distinction

The system strictly tracks and reports data provenance tiers in every alert and processing report:

- **`VERIFIED`**: Official transit authority releases (Western Railway, Central Railway, BEST, Mumbai Metro One).
- **`USER_REPORTED`**: Crowdsourced live reports from students with peer confirmation weighting.
- **`ESTIMATED`**: Calculated environmental/waterlogging risks and traffic congestion heuristics.
- **`SYNTHETIC`**: Algorithmic prototype simulations (e.g. simulated morning peak rush hour).

Every batch processing report explicitly articulates:
- `feedStatus.liveFeedConfigured`: boolean
- `feedStatus.operational`: boolean
- `feedStatus.syntheticDataEvaluated`: boolean
- `trigger`: `'scheduled'` vs `'manual_admin'`

---

## 5. Security & Privacy Invariants

1. **Student Alert Isolation**:
   - Endpoints reject requests attempting to view, list, or dismiss another student's private disruption alert with `403 Forbidden`.
   - Broadcast alerts (`userId: null`) are visible to all authenticated students.
2. **Internal Processing Protection**:
   - `POST /api/commute/alerts/process` is strictly restricted to users with `role: 'admin'`. Authenticated students receive `403 Forbidden`.
3. **Credential Redaction**:
   - All external keys, tokens, and passwords in error logs or delivery payloads are automatically sanitized via `sanitizeCredentials()`.

---

## 6. API Endpoints Reference

### 1. List Active Alerts
`GET /api/commute/alerts`
- **Auth**: Bearer token (Student or Admin)
- **Query Params**: `mode`, `area`, `severity`, `disruptionType`, `limit`
- **Response**:
```json
{
  "success": true,
  "timestamp": "2026-10-14T12:00:00.000Z",
  "alerts": [
    {
      "id": "alert-123",
      "userId": "user-456",
      "disruptionType": "delay",
      "severity": "severe",
      "title": "[TRAIN Advisory] Major delays reported on Western Railway Slow lines (~20 min delay)",
      "message": "Scheduled Mega Block on Western Railway Slow lines between Dadar and Andheri.",
      "relevanceReason": "Matches your candidate route Western Railway corridor",
      "status": "active",
      "validFrom": 1728900000000,
      "validUntil": 1728921600000
    }
  ],
  "count": 1
}
```

### 2. View Alert Details
`GET /api/commute/alerts/:id`
- **Auth**: Bearer token (Owner student or Admin)
- **Response**: `{ "success": true, "alert": { ... } }`

### 3. Dismiss Alert
`POST /api/commute/alerts/:id/dismiss`
- **Auth**: Bearer token (Owner student or Admin)
- **Response**: `{ "success": true, "message": "Commute disruption alert dismissed successfully", "alert": { ... } }`

### 4. Get Notification Preferences
`GET /api/commute/alerts/preferences`
- **Auth**: Bearer token
- **Response**:
```json
{
  "success": true,
  "preferences": {
    "userId": "user-123",
    "alertsEnabled": true,
    "minimumSeverity": "moderate",
    "enabledCategories": ["delay", "cancellation", "service_suspension", "traffic", "waterlogging"],
    "preferredChannels": ["in_app"]
  }
}
```

### 5. Update Notification Preferences
`PUT /api/commute/alerts/preferences`
- **Auth**: Bearer token
- **Body**:
```json
{
  "alertsEnabled": true,
  "minimumSeverity": "severe",
  "preferredChannels": ["in_app", "email"]
}
```

### 6. Alert System Status & Readiness
`GET /api/commute/alerts/status`
- **Auth**: Bearer token
- **Response**:
```json
{
  "success": true,
  "status": "operational",
  "scheduler": {
    "isRunning": true,
    "type": "unified_background_scheduler"
  },
  "channels": {
    "in_app": { "supported": true, "configured": true },
    "socket": { "supported": true, "configured": false },
    "email": { "supported": true, "configured": false },
    "push": { "supported": false, "configured": false }
  },
  "externalFeeds": {
    "liveFeedConfigured": false,
    "operational": false,
    "feedSource": "local_database_and_crowdsourced_reports"
  }
}
```

### 7. Trigger Internal Disruption Processing
`POST /api/commute/alerts/process`
- **Auth**: Bearer token with `admin` role
- **Body (optional)**:
```json
{
  "dryRun": false,
  "forceSync": true
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Commute disruption alert processing completed successfully",
  "report": {
    "executionId": "exec-alert-...",
    "trigger": "manual_admin",
    "durationMs": 42,
    "feedStatus": {
      "liveFeedConfigured": false,
      "syntheticDataEvaluated": true
    },
    "summary": {
      "totalDisruptionsEvaluated": 4,
      "createdCount": 2,
      "duplicatesCount": 2,
      "deliveriesCount": 2
    }
  }
}
```
