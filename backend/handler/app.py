import json
import os

TABLE_NAME = os.environ.get("TABLE_NAME", "")

def _resp(status: int, body: dict, headers: dict | None = None):
    base = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    if headers:
        base.update(headers)
    return {"statusCode": status, "headers": base, "body": json.dumps(body)}

def handler(event, context):
    """
    Lambda proxy integrates with API Gateway.
    `event` contains: httpMethod, path, headers, queryStringParameters, body, etc.
    """
    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")

    if path.endswith("/health"):
        return _resp(200, {"ok": True, "service": "scheduler-api"})

    if path.endswith("/hello"):
        who = (event.get("queryStringParameters") or {}).get("name", "world")
        return _resp(200, {"message": f"hello {who}", "table": TABLE_NAME})

    # Default 404
    return _resp(404, {"error": "NotFound", "path": path})

