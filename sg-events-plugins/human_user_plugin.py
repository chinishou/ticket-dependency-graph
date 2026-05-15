"""
ShotGrid sgEvent daemon plugin — HumanUser sync.

Handles Shotgun_HumanUser_New / _Change / _Retirement events and
keeps ticket-dependency-graph workers in sync with SG HumanUser entities.

Role mapping (per spec):
  Artist   → worker
  Manager  → coordinator
  Admin    → admin
  (any other group defaults to worker)
"""
import os
import logging

from dotenv import load_dotenv
load_dotenv()

from sg_common import post_to_app

_logger = None


def registerCallbacks(reg):
    global _logger
    _logger = reg.logger

    reg.setEmails(os.environ.get("SGDAEMON_HUMANUSER_EMAIL", ""))
    reg.logger.setLevel(logging.DEBUG)

    eventFilter = {
        "Shotgun_HumanUser_New": None,
        "Shotgun_HumanUser_Change": None,
        "Shotgun_HumanUser_Retirement": None,
    }

    reg.registerCallback(
        os.environ.get("SGDAEMON_HUMANUSER_NAME"),
        os.environ.get("SGDAEMON_HUMANUSER_KEY"),
        onHumanUserEvent,
        eventFilter,
        None,
    )


def _fetch_user_details(sg, user_id):
    try:
        user = sg.find_one(
            "HumanUser",
            [["id", "is", user_id]],
            ["id", "name", "permission_group", "department"],
        )
        return user
    except Exception as e:
        if _logger:
            _logger.warning(f"Failed to fetch HumanUser {user_id}: {e}")
        return None


def _build_payload(sg, event):
    entity = event.get("entity")
    meta = event.get("meta", {})
    user_id = entity.get("id") if entity else meta.get("entity_id")
    if not user_id:
        return None

    user = _fetch_user_details(sg, user_id)
    if not user:
        if _logger:
            _logger.warning(f"Could not fetch details for HumanUser {user_id}")
        user = {"id": user_id}

    dept = user.get("department")
    return {
        "id": user_id,
        "name": user.get("name", f"User {user_id}"),
        "permissionGroup": user.get("permission_group"),
        "departmentId": dept["id"] if isinstance(dept, dict) else None,
        "departmentName": dept["name"] if isinstance(dept, dict) else None,
    }


def onHumanUserEvent(sg, logger, event, args):
    event_type = event.get("event_type")
    entity = event.get("entity")
    logger.info(f"SG HumanUser event: {event_type} for entity {entity}")

    if event_type == "Shotgun_HumanUser_Retirement":
        meta = event.get("meta", {})
        user_id = entity.get("id") if entity else meta.get("entity_id")
        if not user_id:
            logger.warning("Could not determine HumanUser id for retirement, skipping")
            return
        result = post_to_app("/api/sg/archive/worker", {"sgUserId": user_id}, logger, plugin_key="HUMANUSER")
        if result:
            logger.info(f"Archived worker for HumanUser {user_id}")
        else:
            logger.error(f"Failed to archive worker for HumanUser {user_id}")

    elif event_type in ("Shotgun_HumanUser_New", "Shotgun_HumanUser_Change"):
        payload = _build_payload(sg, event)
        if not payload:
            logger.warning("Could not build payload, skipping")
            return
        result = post_to_app("/api/sg/sync/worker", payload, logger, plugin_key="HUMANUSER")
        if result:
            logger.info(f"Synced worker for HumanUser {payload['id']}")
        else:
            logger.error(f"Failed to sync worker for HumanUser {payload['id']}")