#!/usr/bin/env python3
"""
sg_client.py — ShotGrid client layer for the Node server.

The Node server has no ShotGrid SDK, so every server-side operation that needs
to talk to SG shells out to this file via `execFile`. The UI's "Import" /
"Bootstrap" buttons in Settings → SG route through here too — they POST to
/api/sg/trigger-sync or /api/sg/trigger-bootstrap, which spawn this script.

Subcommands fall into four categories:

  * Pull data into local DB:  bootstrap, sync-projects, sync-departments,
                              sync-workers, sync-tickets,
                              sync-project-by-id, sync-worker-by-id,
                              sync-ticket-by-id
  * Read SG metadata for UI:  list-statuses, list-projects
  * Write back to SG:         update-ticket-status, update-ticket-priority
  * Direct CLI use:           any of the above, run manually

Historical note: this file was previously named sg_bootstrap.py. Renamed to
reflect that the bootstrap operation is just one of several things it does.
"""
import os
import sys
import json
import argparse
import requests
from dotenv import load_dotenv

load_dotenv()

SG_URL = os.environ.get("SG_URL", "https://wei-dev.shotgrid.autodesk.com")
SCRIPT_NAME = os.environ.get("SCRIPT_NAME", "dev")
API_KEY = os.environ.get("API_KEY", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin2026")
APP_API_URL = os.environ.get("APP_API_URL", "http://localhost:3001")

try:
    import shotgun_api3
    sg = shotgun_api3.Shotgun(SG_URL, script_name=SCRIPT_NAME, api_key=API_KEY)
except ImportError:
    print("ERROR: shotgun_api3 not installed. Run: pip install shotgun_api3")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Fetch helpers
# ---------------------------------------------------------------------------

def fetch_project_statuses():
    """Return sorted list of distinct sg_status values across all non-template projects."""
    rows = sg.find("Project", [["is_template", "is", False]], ["sg_status"])
    return sorted({r.get("sg_status") for r in rows if r.get("sg_status")})

def fetch_ticket_statuses():
    """Return sorted list of distinct sg_status_list values across all tickets."""
    rows = sg.find("Ticket", [], ["sg_status_list"])
    return sorted({r.get("sg_status_list") for r in rows if r.get("sg_status_list")})

def fetch_projects(statuses=None):
    print("Fetching SG Projects...")
    filters = [["is_template", "is", False]]
    if statuses:
        filters.append(["sg_status", "in", statuses])
    fields = ["id", "code", "name", "description", "start_date", "due_date", "sg_duration_days"]
    projects = sg.find("Project", filters=filters, fields=fields)
    result = []
    for p in projects:
        name = p.get("code") or p.get("name") or f"Project {p['id']}"
        result.append({
            "id": p["id"],
            "name": name,
            "description": p.get("description") or "",
            "startDate": p.get("start_date"),
            "endDate": p.get("due_date"),
            "durationDays": p.get("sg_duration_days"),
        })
    print(f"  Found {len(result)} projects")
    return result

def fetch_departments():
    print("Fetching SG Departments...")
    fields = ["id", "name", "description"]
    depts = sg.find("Department", [], fields)
    result = []
    for d in depts:
        result.append({
            "id": d["id"],
            "name": d.get("name") or f"Department {d['id']}",
            "description": d.get("description") or "",
        })
    print(f"  Found {len(result)} departments")
    return result

def fetch_workers():
    # Only import users whose status is "act" (Active). HumanUser uses
    # `sg_status_list` (note the suffix) — not `sg_status` like the rest of
    # the entity types. Disabled/retired users imported earlier are removed
    # by the daemon's retirement event handler on the next change.
    print("Fetching SG HumanUsers (sg_status_list=act)...")
    fields = ["id", "name", "permission_group", "department", "sg_status_list"]
    filters = [["sg_status_list", "is", "act"]]
    users = sg.find("HumanUser", filters=filters, fields=fields)
    result = []
    for u in users:
        dept = u.get("department")
        result.append({
            "id": u["id"],
            "name": u.get("name") or f"User {u['id']}",
            "permissionGroup": u.get("permission_group"),
            "departmentId": dept["id"] if dept else None,
            "departmentName": dept["name"] if dept else None,
            "sgStatus": u.get("sg_status_list"),
        })
    print(f"  Found {len(result)} active users")
    return result

def fetch_project_by_id(project_id):
    """Fetch a single project by SG ID and return the normalized payload dict."""
    print(f"Fetching SG Project {project_id}...")
    fields = ["id", "code", "name", "description", "start_date", "due_date", "sg_duration_days"]
    project = sg.find_one("Project", [["id", "is", project_id]], fields)
    if not project:
        raise RuntimeError(f"Project {project_id} not found in SG")
    name = project.get("code") or project.get("name") or f"Project {project_id}"
    return {
        "id": project["id"],
        "name": name,
        "description": project.get("description") or "",
        "startDate": project.get("start_date"),
        "endDate": project.get("due_date"),
        "durationDays": project.get("sg_duration_days"),
    }

def fetch_worker_by_id(worker_id):
    """Fetch a single human user by SG ID and return the normalized payload dict."""
    print(f"Fetching SG HumanUser {worker_id}...")
    fields = ["id", "name", "permission_group", "department", "sg_status"]
    user = sg.find_one("HumanUser", [["id", "is", worker_id]], fields)
    if not user:
        raise RuntimeError(f"HumanUser {worker_id} not found in SG")
    dept = user.get("department")
    return {
        "id": user["id"],
        "name": user.get("name") or f"User {worker_id}",
        "permissionGroup": user.get("permission_group"),
        "departmentId": dept["id"] if dept else None,
        "departmentName": dept["name"] if dept else None,
        "sgStatus": user.get("sg_status"),
    }

def fetch_ticket_by_id(ticket_id):
    """Fetch a single ticket by SG ID and return the normalized payload dict."""
    print(f"Fetching SG Ticket {ticket_id}...")
    fields = [
        "id", "title", "description", "project",
        "sg_status_list", "sg_estimate", "time_logs_sum", "addressings_to",
    ]
    ticket = sg.find_one("Ticket", [["id", "is", ticket_id]], fields)
    if not ticket:
        raise RuntimeError(f"Ticket {ticket_id} not found in SG")
    assigned = ticket.get("addressings_to") or []
    assignee_list = []
    for a in assigned:
        if isinstance(a, dict):
            assignee_list.append({"id": a["id"], "name": a.get("name", ""), "type": "HumanUser"})
        else:
            assignee_list.append({"id": a, "name": "", "type": "HumanUser"})
    proj = ticket.get("project")
    return {
        "id": ticket["id"],
        "title": ticket.get("title") or f"Ticket {ticket_id}",
        "description": ticket.get("description") or "",
        "project": {"id": proj["id"], "name": proj.get("name", ""), "type": "Project"} if proj else None,
        "sgStatus": ticket.get("sg_status_list"),
        "sgEstimate": ticket.get("sg_estimate"),
        "timeLogsSum": ticket.get("time_logs_sum"),
        "assignedTo": assignee_list,
    }

def fetch_tickets(statuses=None, project_ids=None):
    print("Fetching SG Tickets...")
    fields = [
        "id", "title", "description", "project",
        "sg_status_list", "sg_estimate", "time_logs_sum", "addressings_to",
        "sg_task_ticket_relationship",
    ]
    if statuses:
        filters = [["sg_status_list", "in", statuses]]
    else:
        filters = [["sg_status_list", "is_not", "Closed"]]
    if project_ids:
        # SG accepts a list of {"type": "Project", "id": N} for an "in" filter
        # against an entity field. Coerce ids to int so users can pass strings.
        proj_refs = [{"type": "Project", "id": int(pid)} for pid in project_ids]
        filters.append(["project", "in", proj_refs])
        print(f"  Filtering to {len(proj_refs)} project(s): {[p['id'] for p in proj_refs]}")
    tickets = sg.find("Ticket", filters=filters, fields=fields)
    result = []
    for t in tickets:
        assigned = t.get("addressings_to") or []
        assignee_list = []
        for a in assigned:
            if isinstance(a, dict):
                assignee_list.append({"id": a["id"], "name": a.get("name", ""), "type": "HumanUser"})
            else:
                assignee_list.append({"id": a, "name": "", "type": "HumanUser"})
        proj = t.get("project")
        result.append({
            "id": t["id"],
            "title": t.get("title", f"Ticket {t['id']}"),
            "description": t.get("description") or "",
            "project": {"id": proj["id"], "name": proj.get("name", ""), "type": "Project"} if proj else None,
            "sgStatus": t.get("sg_status_list"),
            "sgEstimate": t.get("sg_estimate"),
            "timeLogsSum": t.get("time_logs_sum"),
            "assignedTo": assignee_list,
        })
    print(f"  Found {len(result)} tickets")
    return result

def derive_site_name(sg_url):
    try:
        from urllib.parse import urlparse
        host = urlparse(sg_url).hostname or sg_url
        return host.split(".")[0] if host else "ShotGrid"
    except Exception:
        return "ShotGrid"

# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

TICKET_BATCH_SIZE = 200

def post(path, payload, timeout=60):
    url = f"{APP_API_URL}{path}"
    resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=timeout)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"POST {path} failed {resp.status_code}: {resp.text[:300]}")
    return resp.json()

# ---------------------------------------------------------------------------
# Subcommand handlers
# ---------------------------------------------------------------------------

def cmd_list_statuses(_args):
    """Output JSON with available project and ticket statuses from SG."""
    result = {
        "projectStatuses": fetch_project_statuses(),
        "ticketStatuses": fetch_ticket_statuses(),
    }
    print(json.dumps(result))

def cmd_list_projects(_args):
    """Output JSON list of SG projects suitable for an import-filter picker.

    Each entry: { id, name, sg_status }. Excludes templates. Sorted by name.
    """
    rows = sg.find(
        "Project",
        [["is_template", "is", False]],
        ["id", "code", "name", "sg_status"],
    )
    out = []
    for p in rows:
        out.append({
            "id": p["id"],
            "name": p.get("code") or p.get("name") or f"Project {p['id']}",
            "sg_status": p.get("sg_status") or "",
        })
    out.sort(key=lambda r: r["name"].lower())
    print(json.dumps({"projects": out}))

def cmd_sync_projects(args):
    statuses = args.statuses.split(",") if args.statuses else None
    projects = fetch_projects(statuses=statuses)
    post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "projects": projects, "tickets": []})
    print(f"Synced {len(projects)} projects")

def cmd_sync_departments(_args):
    departments = fetch_departments()
    post("/api/sg/sync-departments", {"adminPassword": ADMIN_PASSWORD, "departments": departments})
    print(f"Synced {len(departments)} departments")

def cmd_sync_workers(_args):
    workers = fetch_workers()
    post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "workers": workers, "tickets": []})
    print(f"Synced {len(workers)} workers")

def cmd_sync_tickets(args):
    statuses = args.statuses.split(",") if args.statuses else None
    project_ids = [p for p in args.project_ids.split(",") if p.strip()] if args.project_ids else None
    tickets = fetch_tickets(statuses=statuses, project_ids=project_ids)
    total = len(tickets)
    synced = 0
    for i in range(0, max(total, 1), TICKET_BATCH_SIZE):
        batch = tickets[i:i + TICKET_BATCH_SIZE]
        if batch:
            post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "tickets": batch})
        synced += len(batch)
        print(f"  Tickets synced: {synced}/{total}")
    print(f"Synced {total} tickets")

def cmd_sync_project_by_id(args):
    project_id = int(args.id)
    payload = fetch_project_by_id(project_id)
    post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "projects": [payload], "tickets": []})
    print(f"Synced project {project_id}: {payload['name']}")

def cmd_sync_worker_by_id(args):
    worker_id = int(args.id)
    payload = fetch_worker_by_id(worker_id)
    post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "workers": [payload], "tickets": []})
    print(f"Synced worker {worker_id}: {payload['name']}")

def cmd_sync_ticket_by_id(args):
    ticket_id = int(args.id)
    payload = fetch_ticket_by_id(ticket_id)
    post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "tickets": [payload]})
    print(f"Synced ticket {ticket_id}: {payload['title']}")

def update_ticket_status(ticket_id, status):
    """Update a ticket's sg_status_list in ShotGrid."""
    print(f"Updating ticket {ticket_id} status to '{status}'...")
    try:
        sg.update("Ticket", ticket_id, {"sg_status_list": status})
        print(f"Successfully updated ticket {ticket_id} status to '{status}'")
        return True
    except Exception as e:
        print(f"ERROR: Failed to update ticket {ticket_id}: {e}", file=sys.stderr)
        return False

def cmd_update_ticket_status(args):
    ticket_id = int(args.id)
    status = args.status
    success = update_ticket_status(ticket_id, status)
    if success:
        print(f"Updated ticket {ticket_id} status to '{status}'")
    sys.exit(0 if success else 1)

def update_ticket_priority(ticket_id, priority):
    """Update a ticket's priority in ShotGrid (1=highest, 5=lowest)."""
    print(f"Updating ticket {ticket_id} priority to '{priority}'...")
    try:
        sg.update("Ticket", ticket_id, {"priority": str(priority)})
        print(f"Successfully updated ticket {ticket_id} priority to '{priority}'")
        return True
    except Exception as e:
        print(f"ERROR: Failed to update ticket {ticket_id} priority: {e}", file=sys.stderr)
        return False

def cmd_update_ticket_priority(args):
    ticket_id = int(args.id)
    priority = int(args.priority)
    success = update_ticket_priority(ticket_id, priority)
    sys.exit(0 if success else 1)

def cmd_bootstrap(_args):
    print("=" * 50)
    print("SG Bootstrap — Full sync from Flow Production Tracking")
    print("=" * 50)
    site_name = derive_site_name(SG_URL)
    departments = fetch_departments()
    post("/api/sg/sync-departments", {"adminPassword": ADMIN_PASSWORD, "departments": departments})
    print(f"  Departments synced: {len(departments)}")

    projects = fetch_projects()
    workers = fetch_workers()
    post("/api/sg/bootstrap", {
        "adminPassword": ADMIN_PASSWORD,
        "siteName": site_name,
        "projects": projects,
        "workers": workers,
        "tickets": [],
    })
    print(f"  Projects synced: {len(projects)}")
    print(f"  Workers synced:  {len(workers)}")

    tickets = fetch_tickets()
    total = len(tickets)
    synced = 0
    for i in range(0, max(total, 1), TICKET_BATCH_SIZE):
        batch = tickets[i:i + TICKET_BATCH_SIZE]
        if batch:
            post("/api/sg/bootstrap", {"adminPassword": ADMIN_PASSWORD, "tickets": batch})
        synced += len(batch)
        print(f"  Tickets synced: {synced}/{total}")

    print(f"\nBootstrap SUCCESS! {len(departments)} depts, {len(projects)} projects, {len(workers)} workers, {total} tickets")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SG sync tool for ticket-dependency-graph")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("list-statuses", help="Print available project/ticket statuses as JSON")
    sub.add_parser("list-projects", help="Print SG projects (id, name, sg_status) as JSON")

    p_proj = sub.add_parser("sync-projects", help="Sync projects (optionally filter by status)")
    p_proj.add_argument("--statuses", help="Comma-separated sg_status values to include")

    sub.add_parser("sync-departments", help="Sync departments from SG")
    sub.add_parser("sync-workers", help="Sync workers/users from SG")

    p_tick = sub.add_parser("sync-tickets", help="Sync tickets (optionally filter by status and/or project)")
    p_tick.add_argument("--statuses", help="Comma-separated sg_status_list values to include")
    p_tick.add_argument("--project-ids", dest="project_ids", help="Comma-separated SG Project IDs to include")

    p_proj_one = sub.add_parser("sync-project-by-id", help="Re-sync a single project by SG ID")
    p_proj_one.add_argument("--id", required=True, help="SG Project ID to sync")

    p_worker_one = sub.add_parser("sync-worker-by-id", help="Re-sync a single worker by SG ID")
    p_worker_one.add_argument("--id", required=True, help="SG HumanUser ID to sync")

    p_one = sub.add_parser("sync-ticket-by-id", help="Re-sync a single ticket by SG ID")
    p_one.add_argument("--id", required=True, help="SG Ticket ID to sync")

    p_status = sub.add_parser("update-ticket-status", help="Update a ticket's status in SG")
    p_status.add_argument("--id", required=True, help="SG Ticket ID to update")
    p_status.add_argument("--status", required=True, help="New sg_status_list value")

    p_priority = sub.add_parser("update-ticket-priority", help="Update a ticket's priority in SG (1-5)")
    p_priority.add_argument("--id", required=True, help="SG Ticket ID to update")
    p_priority.add_argument("--priority", required=True, help="New priority value (1=highest, 5=lowest)")

    sub.add_parser("bootstrap", help="Full bootstrap (all entities)")

    args = parser.parse_args()

    handlers = {
        "list-statuses": cmd_list_statuses,
        "list-projects": cmd_list_projects,
        "sync-projects": cmd_sync_projects,
        "sync-departments": cmd_sync_departments,
        "sync-workers": cmd_sync_workers,
        "sync-tickets": cmd_sync_tickets,
        "sync-project-by-id": cmd_sync_project_by_id,
        "sync-worker-by-id": cmd_sync_worker_by_id,
        "sync-ticket-by-id": cmd_sync_ticket_by_id,
        "update-ticket-status": cmd_update_ticket_status,
        "update-ticket-priority": cmd_update_ticket_priority,
        "bootstrap": cmd_bootstrap,
        None: cmd_bootstrap,  # default: full bootstrap for backward compat
    }
    handler = handlers.get(args.cmd, cmd_bootstrap)
    try:
        handler(args)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
