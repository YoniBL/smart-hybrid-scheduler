import json
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from boto3.dynamodb.conditions import Key
import boto3

DDB = boto3.resource("dynamodb")
TABLE = DDB.Table(os.environ.get("TABLE_NAME", ""))

# ---- Helpers -----------------------------------------------------------------

def resp(status: int, body: Any, headers: Optional[Dict[str, str]] = None):
    base = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Debug-User,X-Request-Id",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    }
    if headers:
        base.update(headers)
    return {"statusCode": status, "headers": base, "body": json.dumps(body)}

def parse_json(body: Optional[str]) -> Dict[str, Any]:
    if not body:
        return {}
    try:
        return json.loads(body)
    except Exception:
        raise BadRequest("Invalid JSON body")

def iso(dt: datetime) -> str:
    # Always emit Zulu
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

_ISO_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})$"
)

def parse_iso(s: str) -> datetime:
    if not isinstance(s, str) or not _ISO_RE.match(s):
        raise BadRequest("Time must be ISO8601, e.g. 2025-10-15T13:00:00Z")
    # Normalize 'Z' to +00:00 for fromisoformat
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s).astimezone(timezone.utc)
    except Exception:
        raise BadRequest("Invalid ISO8601 timestamp")

def ensure(cond: bool, msg: str):
    if not cond:
        raise BadRequest(msg)

def get_user_id(event: Dict[str, Any]) -> str:
    # Try Cognito authorizer (when added), else header, else dev default
    auth = (event.get("requestContext") or {}).get("authorizer") or {}
    claims = auth.get("claims") or {}
    if "sub" in claims:
        return f"USER#{claims['sub']}"
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if "x-debug-user" in headers and headers["x-debug-user"].strip():
        return f"USER#{headers['x-debug-user'].strip()}"
    return "USER#dev-user"

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

# ---- Errors ------------------------------------------------------------------

class BadRequest(Exception):
    pass

def error_to_response(e: Exception):
    if isinstance(e, BadRequest):
        return resp(400, {"error": "BadRequest", "message": str(e)})
    return resp(500, {"error": "InternalError", "message": "Unexpected error"})

# ---- Persistence helpers ------------------------------------------------------

def put_event(user_pk: str, title: str, start_iso: str, end_iso: str, immutable: bool, source: str) -> Dict[str, Any]:
    eid = new_id("ev")
    item = {
        "pk": user_pk,
        "sk": f"EVENT#{eid}",
        "type": "EVENT",
        "eventId": eid,
        "title": title,
        "startISO": start_iso,
        "endISO": end_iso,
        "immutable": bool(immutable),
        "source": source or "app",
        "gsi1pk": user_pk,
        "gsi1sk": start_iso,  # sort by start time
    }
    TABLE.put_item(Item=item)
    return item

def get_events_in_range(user_pk: str, start_iso: str, end_iso: str) -> List[Dict[str, Any]]:
    # Query by time GSI; filter to end<=range and start<end
    # Simple: only check startISO within [start_iso, end_iso)
    resp_ = TABLE.query(
        IndexName="GSI1",
        KeyConditionExpression="gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to",
        ExpressionAttributeValues={":pk": user_pk, ":from": start_iso, ":to": end_iso},
    )
    items = resp_.get("Items") or []
    # Optionally filter by true overlap; for now, start in range is sufficient.
    return [i for i in items if i.get("type") == "EVENT"]

def delete_event(user_pk: str, event_id: str) -> bool:
    sk = f"EVENT#{event_id}"
    # Ensure exists
    existing = TABLE.get_item(Key={"pk": user_pk, "sk": sk}).get("Item")
    if not existing:
        return False
    TABLE.delete_item(Key={"pk": user_pk, "sk": sk})
    return True

def put_task(user_pk: str, title: str, duration_min: int, category: Optional[str], notes: Optional[str]) -> Dict[str, Any]:
    tid = new_id("t")
    now = iso(datetime.now(timezone.utc))
    item = {
        "pk": user_pk,
        "sk": f"TASK#{tid}",
        "type": "TASK",
        "taskId": tid,
        "title": title,
        "durationMin": int(duration_min),
        "category": category or "",
        "notes": notes or "",
        "createdAt": now,
    }
    TABLE.put_item(Item=item)
    return item

def list_tasks(user_pk: str) -> List[Dict[str, Any]]:
    resp_ = TABLE.query(
        KeyConditionExpression=Key("pk").eq(user_pk) & Key("sk").begins_with("TASK#")
    )
    return resp_.get("Items") or []

def delete_task(user_pk: str, task_id: str) -> bool:
    sk = f"TASK#{task_id}"
    existing = TABLE.get_item(Key={"pk": user_pk, "sk": sk}).get("Item")
    if not existing:
        return False
    TABLE.delete_item(Key={"pk": user_pk, "sk": sk})
    return True

def get_availability(user_pk: str) -> Dict[str, Any]:
    # Fetch all AVAIL#* rows
    resp_ = TABLE.query(
        KeyConditionExpression="pk = :pk AND begins_with(sk, :p)",
        ExpressionAttributeValues={":pk": user_pk, ":p": "AVAIL#"},
    )
    weekly = {}
    for it in resp_.get("Items") or []:
        # sk = AVAIL#Mon
        day = it["sk"].split("#", 1)[1]
        weekly[day] = it.get("windows", [])
    # Default empty if none
    return {
        "weekly": weekly or {
            "Mon": [], "Tue": [], "Wed": [], "Thu": [], "Fri": [], "Sat": [], "Sun": []
        },
        "timezone": "Asia/Jerusalem",  # default; UI can overwrite and then PUT
    }

def put_availability(user_pk: str, weekly: Dict[str, List[List[str]]], tz: str):
    # Replace all AVAIL#* entries (idempotent, small N=7)
    days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    for d in days:
        windows = weekly.get(d, [])
        TABLE.put_item(Item={
            "pk": user_pk,
            "sk": f"AVAIL#{d}",
            "type": "AVAIL",
            "windows": windows,
            "timezone": tz or "Asia/Jerusalem",
        })

# ---- HTTP handlers ------------------------------------------------------------

def handle_health(_: Dict[str, Any]) -> Dict[str, Any]:
    return resp(200, {"ok": True, "service": "scheduler-api"})

def handle_events_post(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    data = parse_json(event.get("body"))
    title = (data.get("title") or "").strip()
    startISO = data.get("startISO")
    endISO = data.get("endISO")
    immutable = bool(data.get("immutable", True))
    source = (data.get("source") or "app").strip()

    ensure(len(title) > 0, "title is required")
    ensure(startISO and endISO, "startISO and endISO are required")
    start_dt = parse_iso(startISO)
    end_dt = parse_iso(endISO)
    ensure(end_dt > start_dt, "endISO must be after startISO")
    ensure((end_dt - start_dt) <= timedelta(hours=12), "event duration too long")

    item = put_event(user_pk, title, iso(start_dt), iso(end_dt), immutable, source)
    return resp(201, {"eventId": item["eventId"], **{k: item[k] for k in ("title","startISO","endISO","immutable","source")}})

def handle_events_get(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    qs = event.get("queryStringParameters") or {}
    fromISO = qs.get("from")
    toISO = qs.get("to")
    ensure(fromISO and toISO, "from and to query params are required")
    start = parse_iso(fromISO)
    end = parse_iso(toISO)
    ensure(end > start, "to must be after from")

    items = get_events_in_range(user_pk, iso(start), iso(end))
    # Return clean model
    events = [{
        "eventId": it["eventId"],
        "title": it["title"],
        "startISO": it["startISO"],
        "endISO": it["endISO"],
        "immutable": it.get("immutable", True),
        "source": it.get("source","app")
    } for it in items]
    return resp(200, {"events": events})

def handle_events_delete(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    # Expect path like /events/ev_xxx
    path = event.get("path") or ""
    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise BadRequest("eventId path param required: /events/{id}")
    event_id = parts[-1]
    ok = delete_event(user_pk, event_id)
    if not ok:
        return resp(404, {"error": "NotFound"})
    return resp(204, {})

def handle_tasks_post(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    data = parse_json(event.get("body"))
    title = (data.get("title") or "").strip()
    duration = data.get("durationMin")
    category = data.get("category")
    notes = data.get("notes")
    ensure(len(title) > 0, "title is required")
    ensure(isinstance(duration, int) and 5 <= duration <= 480, "durationMin (5..480) required (minutes)")
    item = put_task(user_pk, title, duration, category, notes)
    return resp(201, {
        "taskId": item["taskId"],
        "title": item["title"],
        "durationMin": item["durationMin"],
        "category": item.get("category",""),
        "notes": item.get("notes",""),
        "createdAt": item["createdAt"],
    })

def handle_tasks_get(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    tasks = list_tasks(user_pk)
    clean = [{
        "taskId": it["taskId"],
        "title": it["title"],
        "durationMin": it["durationMin"],
        "category": it.get("category",""),
        "notes": it.get("notes",""),
        "createdAt": it["createdAt"],
    } for it in tasks]
    return resp(200, {"tasks": clean})

def handle_tasks_delete(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    path = event.get("path") or ""
    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise BadRequest("taskId path param required: /tasks/{id}")
    task_id = parts[-1]
    ok = delete_task(user_pk, task_id)
    if not ok:
        return resp(404, {"error": "NotFound"})
    return resp(204, {})

def handle_availability_get(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    return resp(200, get_availability(user_pk))

def handle_availability_put(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    data = parse_json(event.get("body"))
    weekly = data.get("weekly") or {}
    tz = (data.get("timezone") or "Asia/Jerusalem").strip()
    # quick validation: list of [start,end] strings
    for day, windows in weekly.items():
        if not isinstance(windows, list):
            raise BadRequest(f"weekly[{day}] must be a list of [start,end]")
        for w in windows:
            if not (isinstance(w, list) and len(w) == 2 and all(isinstance(x, str) for x in w)):
                raise BadRequest(f"weekly[{day}] items must be [\"HH:MM\",\"HH:MM\"]")
    put_availability(user_pk, weekly, tz)
    return resp(200, {"ok": True})

def handle_extension_check(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    data = parse_json(event.get("body"))
    startISO = data.get("startISO")
    endISO = data.get("endISO")
    ensure(startISO and endISO, "startISO and endISO are required")
    s = parse_iso(startISO)
    e = parse_iso(endISO)
    ensure(e > s, "endISO must be after startISO")
    # Query events overlapping [s,e): simplest is to fetch events in that day range
    day_start = iso(datetime(s.year, s.month, s.day, tzinfo=timezone.utc))
    day_end = iso(datetime(s.year, s.month, s.day, tzinfo=timezone.utc) + timedelta(days=1))
    events = get_events_in_range(user_pk, day_start, day_end)
    conflicts = []
    for ev in events:
        ev_s = parse_iso(ev["startISO"])
        ev_e = parse_iso(ev["endISO"])
        if not (e <= ev_s or s >= ev_e):  # overlap exists
            conflicts.append({
                "eventId": ev["eventId"],
                "title": ev["title"],
                "startISO": ev["startISO"],
                "endISO": ev["endISO"],
            })
    return resp(200, {"available": len(conflicts) == 0, "conflicts": conflicts})

def handle_suggest(event: Dict[str, Any]) -> Dict[str, Any]:
    # Placeholder stub; we’ll implement gap-finder next.
    data = parse_json(event.get("body"))
    duration = data.get("durationMin")
    fromISO = data.get("fromISO")
    toISO = data.get("toISO")
    ensure(isinstance(duration, int) and duration > 0, "durationMin required")
    ensure(fromISO and toISO, "fromISO and toISO required")
    _ = (parse_iso(fromISO), parse_iso(toISO))  # validate
    return resp(200, {"suggestions": [], "note": "Suggest is not implemented yet; next step will add gap finder."})

# ---- Router -------------------------------------------------------------------

def handler(event, context):
    try:
        method = (event.get("httpMethod") or "").upper()
        path = event.get("path") or "/"

        # CORS preflight
        if method == "OPTIONS":
            return resp(200, {"ok": True})

        if path.endswith("/health"):
            return handle_health(event)

        # /events and /events/{id}
        if path.startswith("/events"):
            if method == "POST" and path == "/events":
                return handle_events_post(event)
            if method == "GET" and path == "/events":
                return handle_events_get(event)
            if method == "DELETE":
                return handle_events_delete(event)

        # /tasks and /tasks/{id}
        if path.startswith("/tasks"):
            if method == "POST" and path == "/tasks":
                return handle_tasks_post(event)
            if method == "GET" and path == "/tasks":
                return handle_tasks_get(event)
            if method == "DELETE":
                return handle_tasks_delete(event)

        # /availability
        if path == "/availability":
            if method == "GET":
                return handle_availability_get(event)
            if method == "PUT":
                return handle_availability_put(event)

        # /extension/check
        if path == "/extension/check" and method == "POST":
            return handle_extension_check(event)

        # /suggest
        if path == "/suggest" and method == "POST":
            return handle_suggest(event)

        return resp(404, {"error": "NotFound", "path": path, "method": method})
    except Exception as e:
        return error_to_response(e)
