# Smart Hybrid Scheduler — Architecture

_Last updated: October 2025_

## 1) System Overview

Smart Hybrid Scheduler blends fixed **calendar events** with flexible **tasks**, and proposes **smart time slots** between immovable blocks. It is serverless-first to minimize cost and operational load.

```
Browser (React/Vite)
   |
   | HTTPS (fetch; JSON; CORS)
   v
Amazon API Gateway (REST /prod)
   |
   v
AWS Lambda (Python 3.12, single handler w/ router)
   |
   v
Amazon DynamoDB (single table + GSI)
   |
   +--> (optional) EventBridge → scheduled invocations (digests, cleanup)
   +--> (future) SES/SNS/STEP FUNCTIONS as needed

Static Web Hosting:
- Amazon S3 (site bucket) + Amazon CloudFront (CDN)
Authentication (future):
- Amazon Cognito (User Pool + App Client)
Browser Extension (future):
- Manifest V3: content script + service worker → API
```

## 2) High-Level User Flows

### Create fixed event
1. User types NLP (`“lunch with Sarah tomorrow 13:00”`) or uses form.  
2. Frontend parses local datetime → UTC ISO strings.  
3. `POST /events` → Lambda validates and stores event.  
4. Calendar updates via `GET /events?from=&to=`.

### Create task and find time
1. User creates a task (no duration asked up front).  
2. When needed, user chooses desired duration (e.g., 60m) and clicks Suggest.  
3. Frontend calls `POST /suggest` with `[fromISO,toISO]`.  
4. Lambda subtracts fixed events from availability, returns ranked suggestions.  
5. User accepts → frontend `POST /events` with selected slot.

### Browser extension
1. Content script detects page event time (schema.org JSON-LD → fallback regex).  
2. Service worker calls `/extension/check` with `[startISO,endISO]`.  
3. If free → button “Add to schedule” → `POST /events`.

## 3) Components

### Frontend (React + Vite)
- Week calendar grid (Sun–Sat).
- Tasks panel: create/delete tasks; request suggestions with chosen duration.  
- NLP input using `chrono-node` (client-side parse).  
- Environment config via `.env`:
  - `VITE_API_BASE`
  - `VITE_DEBUG_USER` (temporary, for dev).

### API Gateway (REST)
- Single stage `/prod`, Lambda proxy integration.
- CORS enabled.

### AWS Lambda (Python 3.12)
- Single handler with a lightweight router.  
- Endpoints:
  - `GET /health`
  - `POST /events`, `GET /events`, `DELETE /events/{id}`
  - `POST /tasks`, `GET /tasks`, `DELETE /tasks/{id}`
  - `GET /availability`, `PUT /availability`
  - `POST /suggest` (gap finder)
  - `POST /extension/check` (conflict check)
- Error handling: unified JSON shape; 4xx vs 5xx; Decimal→JSON encoder.

### DynamoDB (single table)
- **Table**: partition key `pk`, sort key `sk`.  
- **GSI1**: `gsi1pk` + `gsi1sk` for time-ordered event queries.

Item shapes:

| Entity  | pk                 | sk                 | gsi1pk             | gsi1sk         |
|---------|--------------------|--------------------|--------------------|----------------|
| Event   | `USER#{uid}`       | `EVENT#{eventId}`  | `USER#{uid}`       | `startISO`     |
| Task    | `USER#{uid}`       | `TASK#{taskId}`    | —                  | —              |
| Avail   | `USER#{uid}`       | `AVAIL#{weekday}`  | —                  | —              |

## 4) Scheduling Logic (Gap Finder)

Inputs:
- Range `[fromISO,toISO]`
- Weekly availability windows (local time)
- Fixed events (merged UTC intervals)
- Desired duration

Algorithm:
1. Convert availability per day to UTC.
2. Merge intervals and subtract busy blocks.
3. Generate candidates (30m step).
4. Score and return top results.

All times are UTC internally.

## 5) Authentication & Multi-Tenancy

### Current (dev)
- `X-Debug-User: <name>` → `pk = USER#<name>`.

### Future (prod)
- Cognito JWT → Lambda extracts `sub` → `pk = USER#<sub>`.

## 6) Deployment

- `cdk synth`, `cdk deploy` (infra)
- `cdk deploy --hotswap` for code-only updates
- `npm run build` → sync `/dist` → S3 → CloudFront

Frontend `.env`:
```
VITE_API_BASE=https://<api-id>.execute-api.<region>.amazonaws.com/prod
VITE_DEBUG_USER=yonatan
```

## 7) Observability

- CloudWatch logs
- Lambda errors → structured stack traces
- Alarms: 5xx rate, latency P95

## 8) Costs (MVP)

- Lambda + API Gateway: ~$0–1/mo free tier
- DynamoDB: ~$1–3/mo on-demand
- CloudFront + S3: ~$0–1/mo

## 9) Future Enhancements

- Rich calendar interactions
- Team sharing
- Smart task placement
- Mobile-first layout
- Chrome extension (Manifest V3)
