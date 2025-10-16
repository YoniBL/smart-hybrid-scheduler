# Smart Hybrid Scheduler — Project Roadmap

_Last updated: October 2025_

## 🎯 Vision
Smart Hybrid Scheduler is a personal productivity app that blends **calendar events**, **task management**, and **smart scheduling**.
It aims to provide an intelligent, natural, and minimal workflow for managing real-life commitments — combining fixed events with flexible tasks in one dynamic view.

---

## 🧩 Current MVP Scope (✅ Completed)
- AWS backend (CDK, Lambda, DynamoDB, API Gateway)
- REST API endpoints:
  - `/events` — CRUD for calendar events
  - `/tasks` — CRUD for tasks (with or without duration)
  - `/availability` — user availability template
  - `/suggest` — smart gap finder for task placement
  - `/extension/check` — browser extension API for availability checks
- Python backend with `boto3` + FastAPI-style Lambda routing
- React + Vite frontend:
  - Week calendar (Sun–Sat)
  - Task list with suggest integration
  - NLP event/task creation via `chrono-node`
  - Simple hybrid design (local + cloud)

---

## 🚀 Phase 1 — Short-Term (UI/UX & Core Features)
> Focus: user experience and smart task flow

| Feature | Goal | Status |
|----------|------|--------|
| ✅ Refine week view to Sun–Sat | Match local culture and calendar convention | ✅ Done |
| Editable events | Inline rename and drag-drop rescheduling | ⏳ Planned |
| Mark tasks as done | Toggle “complete” and filter between done / pending | ⏳ Planned |
| Remove time requirement for tasks | Keep flexible tasks; suggest only when needed | ✅ Done |
| Improve NLP parsing | Understand phrases like “next Tuesday afternoon” | ⏳ Planned |
| Show current time indicator | Visual red line in calendar grid | ⏳ Planned |
| Task duration picker (suggest only) | Control how much time a suggestion should occupy | ✅ Done |
| Basic dark mode toggle | CSS variable-based theme switch | ⏳ Planned |

---

## 🧱 Phase 2 — Mid-Term (Infra & Integrations)
> Focus: authentication, persistence, and scalability

| Feature | Goal | Status |
|----------|------|--------|
| AWS Cognito authentication | Replace debug header with secure JWT-based users | ⏳ Planned |
| CloudFront deploy via CDK | Automate frontend hosting pipeline | ⏳ Planned |
| DynamoDB single-table refactor | Store all user data in a unified schema | ✅ Done |
| S3 file storage | Attach notes or media to events/tasks | ⏳ Planned |
| Configurable time zones | Automatically detect and update via browser | ⏳ Planned |

---

## 🌐 Phase 3 — Long-Term (Smart & Social Features)
> Focus: intelligence, collaboration, and viral growth

| Feature | Goal | Status |
|----------|------|--------|
| Chrome extension | Detect events on websites (concerts, reservations) and auto-suggest add | ⏳ Planned |
| Smart task auto-placement | Auto-schedule flexible tasks at ideal times | ⏳ Planned |
| Team sharing | Collaborate on shared calendars | ⏳ Planned |
| AI task insights | Analyze workload and suggest improvements | ⏳ Planned |
| Mobile-first redesign | Responsive layout for mobile and tablet | ⏳ Planned |

---

## 🧭 Development Principles
- **Simplicity first**: each feature should work well standalone before adding complexity.
- **AWS-native**: infrastructure managed entirely via CDK.
- **Offline-friendly UI**: frontend stores temporary state locally and syncs later.
- **Open modularity**: clean separation between backend, API schema, and frontend modules.

---

## 🛠️ Next Steps
1. [ ] Implement inline editing for calendar events.  
2. [ ] Add “done” toggle for tasks with visual separation.  
3. [ ] Create `/docs/ARCHITECTURE.md` (backend + infra diagram).  
4. [ ] Replace debug user header with AWS Cognito JWT.  
5. [ ] Prepare beta release on AWS CloudFront with public demo link.

---

_Authored by [Yonatan Benizri Levi](https://github.com/YoniBL) — Tel Aviv University, 2025_

