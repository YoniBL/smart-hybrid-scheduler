import json
from decimal import Decimal
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from datetime import date, time as dtime
from zoneinfo import ZoneInfo
from typing import Iterable
from typing import Any, Dict, List, Optional, Tuple
from boto3.dynamodb.conditions import Key
import boto3
import traceback

DDB = boto3.resource("dynamodb")
TABLE = DDB.Table(os.environ.get("TABLE_NAME", ""))

# ---- Helpers -----------------------------------------------------------------
class DecimalJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            # If the Decimal has no fractional part, return int; otherwise float
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)
    
def resp(status: int, body: Any, headers: Optional[Dict[str, str]] = None):
    base = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Debug-User,X-Request-Id",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    }
    if headers:
        base.update(headers)
    return {
    "statusCode": status,
    "headers": base,
    "body": json.dumps(body, cls=DecimalJSONEncoder)
}


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
    print("ERROR:", repr(e))
    print(traceback.format_exc())  # <-- captures full stack trace
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

# ---- Scheduling helpers (intervals, availability, candidates) ----------------

def daterange_utc(start: datetime, end: datetime) -> Iterable[date]:
    """Yield each date (UTC) starting at start.date() up to but not including end.date() if times exclude.
       We will iterate dates in the user's timezone later; here we use UTC boundary safely and then localize per day."""
    current = start.date()
    last = (end - timedelta(seconds=1)).date()
    while current <= last:
        yield current
        current = current + timedelta(days=1)

def local_day_windows_to_utc(
    day_date: date, weekly: Dict[str, List[List[str]]], tz_name: str
) -> List[Tuple[datetime, datetime]]:
    """For a specific calendar day, take the user's availability 'HH:MM' windows for that weekday
       (in their local tz) and convert to UTC datetimes."""
    tz = ZoneInfo(tz_name)
    weekday_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekday = weekday_map[datetime(day_date.year, day_date.month, day_date.day).weekday()]
    day_windows = weekly.get(weekday, [])
    intervals: List[Tuple[datetime, datetime]] = []
    for pair in day_windows:
        if not (isinstance(pair, list) and len(pair) == 2):
            continue
        try:
            hh1, mm1 = map(int, pair[0].split(":"))
            hh2, mm2 = map(int, pair[1].split(":"))
        except Exception:
            continue
        local_start = datetime(day_date.year, day_date.month, day_date.day, hh1, mm1, tzinfo=tz)
        local_end   = datetime(day_date.year, day_date.month, day_date.day, hh2, mm2, tzinfo=tz)
        if local_end <= local_start:
            continue
        intervals.append((
            local_start.astimezone(timezone.utc),
            local_end.astimezone(timezone.utc)
        ))
    return merge_intervals(intervals)

def merge_intervals(intervals: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    """Merge overlapping/adjacent intervals."""
    if not intervals:
        return []
    ints = sorted(intervals, key=lambda x: x[0])
    merged = [ints[0]]
    for s, e in ints[1:]:
        last_s, last_e = merged[-1]
        if s <= last_e:
            merged[-1] = (last_s, max(last_e, e))
        else:
            merged.append((s, e))
    return merged

def subtract_intervals(
    base: List[Tuple[datetime, datetime]],
    blocks: List[Tuple[datetime, datetime]],
) -> List[Tuple[datetime, datetime]]:
    """Subtract blocks from base, returning remaining free intervals (all UTC)."""
    if not base:
        return []
    blocks = merge_intervals(blocks)
    free = []
    for s, e in base:
        cur_start = s
        for bs, be in blocks:
            if be <= cur_start or bs >= e:
                continue
            # overlap
            if bs > cur_start:
                free.append((cur_start, bs))
            cur_start = max(cur_start, be)
            if cur_start >= e:
                break
        if cur_start < e:
            free.append((cur_start, e))
    return [iv for iv in free if iv[1] > iv[0]]

def clamp_to_range(
    intervals: List[Tuple[datetime, datetime]],
    start: datetime,
    end: datetime
) -> List[Tuple[datetime, datetime]]:
    """Clip intervals to [start,end)."""
    out = []
    for s, e in intervals:
        cs = max(s, start)
        ce = min(e, end)
        if ce > cs:
            out.append((cs, ce))
    return out

def events_to_intervals(events: List[Dict[str, Any]]) -> List[Tuple[datetime, datetime]]:
    out = []
    for ev in events:
        try:
            s = parse_iso(ev["startISO"])
            e = parse_iso(ev["endISO"])
            if e > s:
                out.append((s, e))
        except Exception:
            continue
    return merge_intervals(out)

def step_candidates_in_interval(
    s: datetime, e: datetime, duration: timedelta, step: timedelta
) -> List[Tuple[datetime, datetime]]:
    """Propose [start, start+duration] candidates at a fixed step, fully inside [s,e)."""
    out = []
    cursor = s
    while cursor + duration <= e:
        out.append((cursor, cursor + duration))
        cursor += step
        # Cap proposals per long interval (avoid thousands)
        if len(out) >= 12:
            break
    return out

def rank_candidates(
    candidates: List[Tuple[datetime, datetime]],
    free_intervals: List[Tuple[datetime, datetime]],
) -> List[Tuple[Tuple[datetime, datetime], float, List[str]]]:
    """A simple scoring:
       + earlier is better
       - small fragmentation penalty if candidate creates tiny gaps (<15m) against its host free interval
    """
    scored = []
    tiny = timedelta(minutes=15)
    for cand in candidates:
        cs, ce = cand
        # find host free interval
        host = None
        for fs, fe in free_intervals:
            if cs >= fs and ce <= fe:
                host = (fs, fe)
                break
        reasons = []
        base = 1.0
        # earlier is better -> subtract proportional days/minutes
        base -= (cs - datetime.now(timezone.utc)).total_seconds() / (60*60*24*30)  # small decay over ~month
        # fragmentation penalty
        if host:
            fs, fe = host
            left_gap = cs - fs
            right_gap = fe - ce
            if timedelta(0) < left_gap < tiny:
                base -= 0.05
                reasons.append("avoided tiny left gap penalty")
            if timedelta(0) < right_gap < tiny:
                base -= 0.05
                reasons.append("avoided tiny right gap penalty")
        scored.append((cand, base, reasons))
    # sort by score desc, then earlier first
    scored.sort(key=lambda x: (-x[1], x[0][0]))
    return scored


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

def handle_events_put(event: Dict[str, Any]) -> Dict[str, Any]:
    user_pk = get_user_id(event)
    path = event.get("path") or ""
    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise BadRequest("eventId path param required: /events/{id}")
    event_id = parts[-1]

    data = parse_json(event.get("body"))
    # Optional updates
    title = data.get("title")
    startISO = data.get("startISO")
    endISO = data.get("endISO")
    immutable = data.get("immutable")

    # Load existing
    sk = f"EVENT#{event_id}"
    res = TABLE.get_item(Key={"pk": user_pk, "sk": sk})
    item = res.get("Item")
    if not item:
        return resp(404, {"error": "NotFound"})

    # Validate times if provided
    if startISO and endISO:
        s = parse_iso(startISO)
        e = parse_iso(endISO)
        ensure(e > s, "endISO must be after startISO")
        item["startISO"] = iso(s)
        item["endISO"] = iso(e)
        item["gsi1sk"] = item["startISO"]

    if title is not None:
        item["title"] = (title or "").strip()
        ensure(len(item["title"]) > 0, "title cannot be empty")

    if immutable is not None:
        item["immutable"] = bool(immutable)

    TABLE.put_item(Item=item)
    return resp(200, {
        "eventId": item["eventId"],
        "title": item["title"],
        "startISO": item["startISO"],
        "endISO": item["endISO"],
        "immutable": item.get("immutable", True),
        "source": item.get("source", "app")
    })


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
    user_pk = get_user_id(event)
    data = parse_json(event.get("body"))
    duration_min = data.get("durationMin")
    fromISO = data.get("fromISO")
    toISO = data.get("toISO")
    ensure(isinstance(duration_min, int) and 5 <= duration_min <= 480, "durationMin (5..480) required")
    ensure(fromISO and toISO, "fromISO and toISO required")

    now_utc = datetime.now(timezone.utc)
    range_start = parse_iso(fromISO)
    range_end   = parse_iso(toISO)
    # Clamp start to now; never suggest in the past
    if range_start < now_utc:
        range_start = now_utc.replace(microsecond=0)
    ensure(range_end > range_start, "toISO must be after fromISO")

    # Load availability & timezone
    avail = get_availability(user_pk)  # {"weekly": {...}, "timezone": "..."}
    weekly = avail.get("weekly", {})
    tz_name = avail.get("timezone") or "Asia/Jerusalem"

    # Build availability intervals in UTC across the requested range (day by day in user's tz)
    avail_intervals: List[Tuple[datetime, datetime]] = []
    # Iterate actual calendar days in the user's timezone to avoid crossing DST weirdness
    # We approximate by iterating UTC dates and converting per-day in local tz (sufficient for MVP).
    for d in daterange_utc(range_start, range_end):
        day_ints = local_day_windows_to_utc(d, weekly, tz_name)
        if not day_ints:
            continue
        avail_intervals.extend(day_ints)

    # Clip to requested window
    avail_intervals = clamp_to_range(merge_intervals(avail_intervals), range_start, range_end)

    # Load fixed events in range and subtract
    events = get_events_in_range(user_pk, iso(range_start), iso(range_end))
    busy = events_to_intervals(events)
    free = subtract_intervals(avail_intervals, busy)

    if not free:
        return resp(200, {"suggestions": [], "note": "No free intervals in the requested range."})

    # Generate candidates: step every 30 minutes inside each free interval
    dur = timedelta(minutes=duration_min)
    step = timedelta(minutes=30)
    candidates: List[Tuple[datetime, datetime]] = []
    for fs, fe in free:
        candidates.extend(step_candidates_in_interval(fs, fe, dur, step))

    if not candidates:
        return resp(200, {"suggestions": [], "note": "No slots of the requested duration."})

    ranked = rank_candidates(candidates, free)
    top = ranked[:4]

    suggestions = [{
        "startISO": iso(cs),
        "endISO": iso(ce),
        "score": round(score, 3),
        "reasons": reasons
    } for (cs, ce), score, reasons in top]

    return resp(200, {"suggestions": suggestions})

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
            if method == "PUT":
                return handle_events_put(event)
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
