import os
import logging
import requests
import time

from dotenv import load_dotenv
load_dotenv()

SG_INTERNAL_SECRET = os.environ.get("SG_INTERNAL_SECRET", "sg-internal-dev-secret")
APP_API_URL = os.environ.get("APP_API_URL", "http://localhost:3001")
SG_SITE_URL = os.environ.get("SG_ED_SITE_URL", "https://your-site.shotgrid.autodesk.com")

_logger = None

def _post_to_app(endpoint, payload, retries=3):
    global _logger
    url = f"{APP_API_URL}{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "x-sg-secret": SG_INTERNAL_SECRET,
    }
    for attempt in range(retries):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code == 200:
                if _logger:
                    _logger.info(f"App API success: {endpoint}")
                return resp.json()
            else:
                if _logger:
                    _logger.warning(f"App API error {resp.status_code}: {resp.text[:200]}")
                # Don't retry client errors (except 408 Request Timeout, 429 Too Many Requests)
                if resp.status_code < 500 and resp.status_code not in (408, 429):
                    break
        except requests.RequestException as e:
            if _logger:
                _logger.warning(f"App API attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(1 * (attempt + 1))
    return None


def registerCallbacks(reg):
    global _logger
    _logger = reg.logger

    reg.setEmails(os.environ.get("SGDAEMON_TICKET_EMAIL", ""))
    reg.logger.setLevel(logging.DEBUG)

    eventFilter = {
        "Shotgun_Ticket_New": None,
        "Shotgun_Ticket_Change": None,
        "Shotgun_Ticket_Retirement": None,
        "Shotgun_Ticket_Revival": None,
    }

    reg.registerCallback(
        os.environ.get("SGDAEMON_TICKET_NAME"),
        os.environ.get("SGDAEMON_TICKET_KEY"),
        onTicketEvent,
        eventFilter,
        None,
    )


def _fetch_ticket_details(sg, ticket_id):
    try:
        ticket = sg.find_one(
            "Ticket",
            [["id", "is", ticket_id]],
            [
                "id",
                "title",
                "description",
                "project",
                "sg_status_list",
                "sg_estimate",
                "time_logs_sum",
                "addressings_to",
            ],
        )
        return ticket
    except Exception as e:
        if _logger:
            _logger.warning(f"Failed to fetch ticket {ticket_id}: {e}")
        return None


def _build_payload(sg, event, event_type):
    meta = event.get("meta", {})
    entity = event.get("entity")
    ticket_id = entity.get("id") if entity else meta.get("entity_id")
    if not ticket_id:
        return None

    ticket = _fetch_ticket_details(sg, ticket_id)
    if not ticket:
        if _logger:
            _logger.warning(f"Could not fetch details for ticket {ticket_id}")
        ticket = {"id": ticket_id}

    payload = {
        "id": ticket_id,
        "title": ticket.get("title", f"Ticket {ticket_id}"),
        "description": ticket.get("description") or "",
        "project": ticket.get("project"),
        "sgStatus": ticket.get("sg_status_list"),
        "sgEstimate": ticket.get("sg_estimate"),
        "timeLogsSum": ticket.get("time_logs_sum"),
        "assignedTo": ticket.get("addressings_to") or [],
    }

    if event_type in ("Shotgun_Ticket_Retirement",):
        payload["retired"] = True

    return payload


def onTicketEvent(sg, logger, event, args):
    event_type = event.get("event_type")
    entity = event.get("entity")
    meta = event.get("meta", {})

    logger.info(f"SG Ticket event: {event_type} for entity {entity}")

    if event_type in ("Shotgun_Ticket_New", "Shotgun_Ticket_Change", "Shotgun_Ticket_Retirement", "Shotgun_Ticket_Revival"):
        payload = _build_payload(sg, event, event_type)
        if not payload:
            logger.warning("Could not build payload, skipping")
            return

        if event_type == "Shotgun_Ticket_Retirement":
            result = _post_to_app("/api/sg/archive/task", {"sgTicketId": payload["id"]})
            if result:
                logger.info(f"Archived task for ticket {payload['id']}")
            else:
                logger.error(f"Failed to archive task for ticket {payload['id']}")
        elif event_type == "Shotgun_Ticket_Revival":
            # Explicit revival: re-sync with retired=False so the task is un-archived
            payload["retired"] = False
            result = _post_to_app("/api/sg/sync/task", payload)
            if result:
                logger.info(f"Revived task for ticket {payload['id']}")
            else:
                logger.error(f"Failed to revive task for ticket {payload['id']}")
        else:
            result = _post_to_app("/api/sg/sync/task", payload)
            if result:
                logger.info(f"Synced task for ticket {payload['id']}")
            else:
                logger.error(f"Failed to sync task for ticket {payload['id']}")