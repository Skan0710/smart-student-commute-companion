# Privacy-Aware Shared Travel Coordination API Documentation

The Shared Travel Coordination API enables voluntary, consent-based commute pairing and travel group coordination among verified students across the Mumbai Metropolitan Region (MMR).

## Core Principles & Invariants

1. **Voluntary Participation**: Participation is strictly opt-in. A student's journeys, match compatibility, and invitations are disabled until explicit consent is recorded.
2. **Privacy-by-Design**: Only coarse public areas (e.g. `Borivali West`, `Andheri East`, `Vile Parle`) and designated transit hubs or campus gates are permitted. Precise residential addresses, room/door numbers, and exact GPS coordinates are strictly rejected.
3. **Anti-Tracking**: The API completely rejects GPS decimal telemetry, device identifiers, and location tracking histories.
4. **Information Boundaries**: Non-members browsing open journeys receive a privacy-masked view that completely shields participant rosters, member identities, and coordination notes.
5. **Role & Membership Authorization**: Organizers alone can invite students, update departure times, assign meeting points, or cancel journeys. Participants can only manage their own invitations, requests, and voluntary withdrawals.
6. **Explicit Consent & Unconditional Withdrawal**: Accepting a journey requires explicit `consentConfirmed: true`. Any participant can decline or withdraw at any time, immediately revoking access to their details without leaving behind zombie records.

---

## Authentication & Base Paths

All shared travel endpoints require student Bearer JWT authentication:
`Authorization: Bearer <token>`

Endpoints are dual-mounted under both `/api/shared-travel` and `/api/student/shared-travel` for flexible frontend client routing.

---

## Endpoints

### 1. Sharing Preferences
- **`GET /api/shared-travel/preferences`**
  - **Description**: Returns the authenticated student's current travel sharing preference, opt-in status, preferred pseudonym, and default coarse commute area.
  - **Response 200**:
    ```json
    {
      "success": true,
      "preferences": {
        "userId": "usr-123",
        "sharingEnabled": true,
        "consentStatus": "opted_in",
        "preferredPseudonym": "Rohan_S",
        "homeAreaCoarse": "Borivali West",
        "defaultCampus": "DJ Sanghvi College of Engineering",
        "maxGroupSizePreference": 4,
        "allowedModes": ["train", "metro"]
      }
    }
    ```

- **`PUT /api/shared-travel/preferences`**
  - **Description**: Enables/disables voluntary sharing or updates pseudonym/home area coarse preferences.
  - **Request Body**:
    ```json
    {
      "sharingEnabled": true,
      "consentConfirmed": true,
      "preferredPseudonym": "Rohan_S",
      "homeAreaCoarse": "Borivali West",
      "maxGroupSizePreference": 4,
      "allowedModes": ["train", "metro"]
    }
    ```

---

### 2. Public Meeting Points
- **`GET /api/shared-travel/meeting-points`**
  - **Description**: Recommends verified, privacy-safe public transit gates, stations, or campus meeting points for coordinating travel.
  - **Query Parameters**:
    - `originArea` (string, optional)
    - `destinationArea` (string, optional)
    - `transportMode` (string, optional: `train`, `metro`, `bus`, `auto`, `walk`)
    - `groupId` (string, optional: inherits origin, destination, and mode from group)
  - **Response 200**:
    ```json
    {
      "success": true,
      "meetingPoints": [
        {
          "id": "mp-wr-borivali-west",
          "name": "Borivali Station West Booking Concourse",
          "area": "Borivali West",
          "landmark": "Platform 1 Main Foot Overbridge Entrance",
          "type": "station_gate",
          "convenienceReason": "Primary Western Railway concourse with direct ticketing access.",
          "estimatedWalkingTimeMinutes": 1
        }
      ],
      "safetyDisclaimer": "Suggested meeting points are designated public transit landmarks..."
    }
    ```

---

### 3. Journey Discovery & Matching
- **`POST /api/shared-travel/journeys/match`**
  - **Description**: Finds compatible open shared journeys matching the student's consented corridor, timing, and transport mode.
  - **Request Body**:
    ```json
    {
      "originArea": "Borivali West",
      "destinationArea": "DJ Sanghvi College of Engineering",
      "transportMode": "train",
      "startTime": 1776315600000,
      "endTime": 1776317400000,
      "limit": 10
    }
    ```
  - **Response 200**:
    ```json
    {
      "success": true,
      "matches": [
        {
          "groupId": "stg-wr-001",
          "title": "Morning Western Fast to Vile Parle",
          "originArea": "Borivali West",
          "destinationArea": "DJ Sanghvi College of Engineering",
          "compatibilityScore": 92,
          "compatibilityTier": "EXCELLENT",
          "reasons": ["Identical transit corridor (Western Railway)", "Compatible departure window"],
          "group": {
            "id": "stg-wr-001",
            "title": "Morning Western Fast to Vile Parle",
            "currentParticipantCount": 2,
            "maxParticipants": 4,
            "hasAvailableSlots": true,
            "members": []
          }
        }
      ],
      "totalMatches": 1,
      "proximityDisclaimer": "Match recommendations are evaluated solely from coarse corridor overlap..."
    }
    ```

---

### 4. Journey Management
- **`POST /api/shared-travel/journeys`**
  - **Description**: Creates a new voluntary shared journey. Creator is enrolled as confirmed organizer.
  - **Request Body**:
    ```json
    {
      "title": "Morning Western Fast to Vile Parle",
      "originArea": "Borivali West",
      "destinationArea": "DJ Sanghvi College of Engineering",
      "departureWindow": {
        "startTime": 1776315600000,
        "endTime": 1776317400000,
        "preferredDepartureTime": "08:15",
        "flexMinutes": 15
      },
      "transportMode": "train",
      "maxParticipants": 4,
      "visibility": "campus_only",
      "suggestedMeetingPoint": {
        "name": "Borivali Station West Booking Concourse",
        "area": "Borivali West",
        "type": "station_gate"
      }
    }
    ```

- **`GET /api/shared-travel/journeys`**
  - **Description**: Lists active journeys, pending invitations, and historical journeys for the authenticated student.
  - **Response 200**:
    ```json
    {
      "success": true,
      "activeJourneys": [...],
      "pendingInvitations": [...],
      "pastJourneys": [...]
    }
    ```

- **`GET /api/shared-travel/journeys/:id`**
  - **Description**: Retrieves journey details. If requester is not an accepted member, participant details are strictly redacted.
  - **Response 200**:
    ```json
    {
      "success": true,
      "journey": {
        "id": "stg-wr-001",
        "title": "Morning Western Fast to Vile Parle",
        "originArea": "Borivali West",
        "destinationArea": "DJ Sanghvi College of Engineering",
        "departureWindow": { ... },
        "currentParticipantCount": 2,
        "maxParticipants": 4,
        "isMember": true,
        "members": [ ... ]
      }
    }
    ```

- **`PATCH /api/shared-travel/journeys/:id`**
  - **Description**: Updates journey details, departure window, or meeting point. Dispatches notifications to participants with `[PROPOSED]` or `[CONFIRMED]` status.
  - **Request Body**:
    ```json
    {
      "departureWindow": {
        "startTime": 1776316200000,
        "endTime": 1776318000000,
        "preferredDepartureTime": "08:30"
      },
      "isConfirmedTime": true,
      "updateReason": "Train timetable rescheduling"
    }
    ```

- **`POST /api/shared-travel/journeys/:id/cancel`**
  - **Description**: Cancels a shared travel journey by the organizer, cascades status to participants, and notifies members.
  - **Request Body**:
    ```json
    {
      "reason": "Lecture cancelled today"
    }
    ```

---

### 5. Participant Actions & Lifecycle
- **`POST /api/shared-travel/journeys/:id/invite`**
  - **Description**: Organizer invites a student via email, username, or userId. Non-enumeration protection ensures responses never leak whether an account exists.
  - **Request Body**:
    ```json
    {
      "inviteeIdentifier": "priya.student@djsce.edu",
      "approximateStop": "Kandivali Station"
    }
    ```

- **`POST /api/shared-travel/journeys/:id/join`**
  - **Description**: Student requests to join an open shared journey.
  - **Request Body**:
    ```json
    {
      "approximateStop": "Malad Station",
      "notes": "Can meet at Platform 2"
    }
    ```

- **`POST /api/shared-travel/journeys/:id/accept`**
  - **Description**: Confirms voluntary participation. Explicit consent (`consentConfirmed: true`) is mandatory.
  - **Request Body**:
    ```json
    {
      "consentConfirmed": true,
      "approximateStop": "Borivali West"
    }
    ```

- **`POST /api/shared-travel/journeys/:id/decline`**
  - **Description**: Declines an invitation unconditionally without being forced to provide a reason.

- **`POST /api/shared-travel/journeys/:id/withdraw`**
  - **Description**: Voluntarily leaves a journey at any time. Immediately terminates sharing of the student's details for that journey and excludes them from future updates.
