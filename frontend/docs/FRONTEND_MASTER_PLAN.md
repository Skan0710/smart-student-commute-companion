# Smart Student Companion — Frontend Master Implementation Plan
**Competition Project for TCS Tech Day at D. J. Sanghvi College of Engineering**  
**Role**: Lead Frontend Engineer, UI/UX Designer, Motion Designer, and PWA Engineer  
**Backend Collaboration**: Skan (Backend Owner)  

---

## 1. Problem Statement & Flagship Hierarchy
**PS P9**: Smart Student Commute Companion  
**Theme**: AI for Smart Mobility + Social Impact  

### Product Hierarchy
1. **Commute Assistant (Competition Flagship)**:
   - Multimodal transit routing across Mumbai Metropolitan Region (Western & Central Railway, Metro Line 1/2A/7, BEST buses, auto/walking connections).
   - Real-time disruption impact analysis, service delay alerts, and deterministic route scoring (100-point composite model).
   - Multi-criteria comparisons: total travel time, transfers, walking burden, fares, reliability risk, and 4-tier data provenance (`VERIFIED`, `USER_REPORTED`, `ESTIMATED`, `SYNTHETIC`).
   - Honest uncertainty indicators and alternate strategy generation (`MODE_SHIFT`, `CORRIDOR_SHIFT`, `STATION_SHIFT`, `SCHEDULE_SHIFT`).
2. **Disruptions & Active Alerts Hub**:
   - Live transit disruption feeds, severity badges (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`), affected lines, and actionable student advice.
   - Quiet-hours notification filtering and background device alerts.
3. **Voluntary Privacy-Aware Shared Travel**:
   - Opt-in peer commute coordination with coarse transit hubs (never home coordinates or live GPS tracking).
   - Explicit consent confirmations, non-enumerating invites, and one-click voluntary withdrawal.
   - Grounded public meeting points at physical station concourses and campus arrival gates.
4. **Academics & Productivity Integration**:
   - Unified student dashboard integrating upcoming class schedules, assignment deadlines, study tasks, and productivity insights without obscuring the flagship commute experience.

---

## 2. Researched Design References & Visual Direction

### Visual Inspiration & UX Patterns
- **Citymapper & Transit App (Mobbin / Refero Mobility Patterns)**:
  - High-density route cards with prominent mode badges (Train, Metro, Bus, Walk) and leg-by-leg visual breakdown.
  - Distinct visual separation between primary recommendation ("Fastest & Most Reliable") and viable alternatives.
  - Transparent trade-off badges (e.g. "+12m travel time, saves ₹25", "Avoids Andheri bottleneck").
- **Linear & Vercel Dashboard Aesthetics (Awwwards SaaS Standards)**:
  - Deep ink/navy foundation (`#020617` base, `#0B1120` cards, `#1E293B` raised borders) with subtle 1px border glows and micro-gradients.
  - Crisp typography hierarchy using Inter and Outfit, high-contrast readable labels, and zero childish emoji overload.
  - Status tokens: Emerald (`#10B981`) for on-time/recommended, Amber (`#F59E0B`) for caution/delays, Rose (`#EF4444`) for suspensions/disruptions, Sky (`#0284C7`) for metro/shared travel.
- **Radix UI & shadcn/ui Component Standards**:
  - Accessible keyboard navigation (Tab/Shift+Tab, Escape dialog closing, arrow key tab lists).
  - Minimum 44×44px touch targets on mobile viewports.
  - Safe area padding for mobile notch/home-indicator bars (`env(safe-area-inset-bottom)`).
- **GSAP & Lenis Motion Guidelines**:
  - GSAP for subtle hero entrance animations, staggered route card reveals, and route trade-off metric transitions.
  - Lenis smooth scrolling applied strictly to desktop viewports, preserving 100% native touch responsiveness on iOS/Android.
  - Full respect for `prefers-reduced-motion: reduce`.

---

## 3. Backend API Integration Matrix

| Domain | Backend Route | Method | Auth | Frontend Service Integration |
|---|---|---|---|---|
| **Auth** | `/api/auth/register`, `/api/auth/login`, `/api/auth/me` | POST/GET | Public / Bearer | `services/auth.js` |
| **Commute Candidates** | `/api/commute/candidates` | POST | Bearer | `services/commuteService.js` (Day 15/17 pipeline) |
| **Commute Recommendations** | `/api/commute/recommendations` | POST | Bearer | `services/commuteService.js` (Day 18 Personalized) |
| **Commute Alerts** | `/api/commute/alerts`, `/api/commute/alerts/:id` | GET | Bearer | `services/commuteAlertsService.js` |
| **Alert Preferences** | `/api/commute/alerts/preferences` | GET/PUT | Bearer | `services/commuteAlertsService.js` |
| **Shared Travel Journeys** | `/api/shared-travel/journeys`, `/:id` | GET/POST/PATCH | Bearer | `services/sharedTravelService.js` |
| **Shared Travel Matching** | `/api/shared-travel/journeys/match` | POST | Bearer | `services/sharedTravelService.js` |
| **Meeting Points** | `/api/shared-travel/meeting-points` | GET | Bearer | `services/sharedTravelService.js` |
| **Shared Travel Consent** | `/api/shared-travel/preferences` | GET/PUT | Bearer | `services/sharedTravelService.js` |
| **Academic Courses & Tasks**| `/api/academic/courses`, `/api/academic/assignments` | GET | Bearer | `services/academicService.js` |
| **Calendar & Timetable** | `/api/calendar/today`, `/api/calendar/upcoming` | GET | Bearer | `services/academicService.js` |
| **Community Reports** | `/api/reports`, `/api/reports/:id/vote` | GET/POST | Bearer / Anon | `services/liveReports.js` (Existing) |
| **Multimodal Plan (Legacy)**| `/api/plan` | POST | Public | `services/planner.js` (Existing) |

---

## 4. Seven-Commit Implementation Roadmap

### Commit 1 — Frontend audit and design foundation
- **Commit Message**: `feat(frontend): establish responsive design foundation`
- **Scope**:
  - Establish complete design token hierarchy in `tailwind.config.js` and `src/index.css` (Ink/Navy surfaces, Emerald mobility accents, Electric Sky, Amber, Rose, border radii, glass tokens, typography).
  - Build reusable UI primitives: `RouteBadge`, `ProvenanceTag`, `TradeoffPill`, `SegmentTimeline`, `StatCounter`, `EmptyCard`, `AccessibleDialog`.
  - Ensure all 351 existing regression tests pass cleanly (`npm test`).
  - Verify zero backend file mutations.

### Commit 2 — Application shell and PWA foundation
- **Commit Message**: `feat(pwa): build responsive application shell`
- **Scope**:
  - Build modernized desktop and mobile application shell (`AppShell.jsx`, `Navbar.jsx`).
  - Mobile bottom navigation with quick-access to Flagship Commute, Alerts, Shared Travel, Academics, and Account.
  - PWA install prompts, manifest compliance, service-worker update events, offline indicator, and safe caching policy (never caching auth tokens or private coordinates).
  - Smooth page transitions and keyboard focus trapping.

### Commit 3 — Commute Assistant interface
- **Commit Message**: `feat(commute): build responsive commute planning interface`
- **Scope**:
  - Build responsive Commute Assistant interface connecting to `/api/commute/candidates` and `/api/commute/recommendations`.
  - Coarse origin/destination selectors (Mumbai railway stations, Metro lines, college arrival gates).
  - Departure window, arrival deadline, and modal constraint filters (train, metro, bus, auto, walk).
  - Primary recommended route presentation with clear rationale ("Why this route"), weakness warnings, and alternative candidate route comparison.
  - Multi-criteria trade-off comparison matrix and leg-by-leg timeline breakdown.

### Commit 4 — Disruptions, alerts, and recommendation details
- **Commit Message**: `feat(ui): integrate commute alerts and explanations`
- **Scope**:
  - Connect to backend `/api/commute/alerts` and `/api/commute/alerts/preferences`.
  - Real-time disruption cards displaying severity, affected transit corridor, estimated delay minutes, and recommended student detour.
  - Visual distinction between verified transit authority notices and crowdsourced community reports.
  - Notification preference controls and quiet-hours integration.

### Commit 5 — Shared travel and student modules
- **Commit Message**: `feat(ui): integrate shared travel and student hubs`
- **Scope**:
  - Build Privacy-Preserving Shared Travel UI (`/api/shared-travel/journeys`, `/match`, `/meeting-points`).
  - Voluntary opt-in consent controls, invitation cards, acceptance/withdrawal buttons.
  - Grounded public meeting point recommendations with pedestrian walking notes.
  - Coherent student hub: connect `/api/calendar/today` and `/api/academic/assignments` into an overview widget on the dashboard without overshadowing the commute assistant.

### Commit 6 — Motion, polish, and responsive refinement
- **Commit Message**: `feat(ui): polish interactions and responsive motion`
- **Scope**:
  - Integrate GSAP for entrance transitions and route comparison expansion.
  - Selective Lenis smooth scrolling on desktop viewports.
  - Enhanced micro-interactions, button active states, and mobile touch feedback (44×44px touch targets).
  - Respect `prefers-reduced-motion`.

### Commit 7 — Integration, PWA, and release verification
- **Commit Message**: `test(frontend): verify responsive PWA and user workflows`
- **Scope**:
  - Run full verification suite (`verify-frontend.js`).
  - Production build audit (`npm run build`).
  - End-to-end audit of all interactive states (empty, loading, error, success, offline).
  - Update `completed_features.md` with verified frontend capabilities.
  - Final review and push to `origin/main`.
