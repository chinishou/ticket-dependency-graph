"""
ShotGrid sgEvent daemon plugin — Project sync.

Handles Shotgun_Project_New / _Change / _Retirement events and
keeps ticket-dependency-graph projects in sync with SG Project entities.

SG source-of-truth fields: name (code), description, start_date,
  due_date (endDate), sg_duration_days.
Local-only fields (preserved on re-sync): strategicPriority, status,
  contributingDepartmentIds, goalIds, milestoneIds.
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

    reg.setEmails(os.environ.get("SGDAEMON_PROJECT_EMAIL", ""))
    reg.logger.setLevel(logging.DEBUG)

    eventFilter = {
        "Shotgun_Project_New": None,
        "Shotgun_Project_Change": None,
        "Shotgun_Project_Retirement": None,
    }

    reg.registerCallback(
        os.environ.get("SGDAEMON_PROJECT_NAME"),
        os.environ.get("SGDAEMON_PROJECT_KEY"),
        onProjectEvent,
        eventFilter,
        None,
    )


def _fetch_project_details(sg, project_id):
    try:
        project = sg.find_one(
            "Project",
            [["id", "is", project_id]],
            ["id", "code", "name", "description", "start_date", "due_date", "sg_duration_days", "is_template"],
        )
        return project
    except Exception as e:
        if _logger:
            _logger.warning(f"Failed to fetch Project {project_id}: {e}")
        return None


def _build_payload(sg, event):
    entity = event.get("entity")
    meta = event.get("meta", {})
    project_id = entity.get("id") if entity else meta.get("entity_id")
    if not project_id:
        return None

    project = _fetch_project_details(sg, project_id)
    if not project:
        if _logger:
            _logger.warning(f"Could not fetch details for Project {project_id}")
        project = {"id": project_id}

    # Skip SG internal/template projects — they're hidden in the SG UI too
    if project.get("is_template"):
        if _logger:
            _logger.info(f"Skipping template project {project_id}")
        return None

    return {
        "id": project_id,
        "name": project.get("code") or project.get("name") or f"Project {project_id}",
        "description": project.get("description") or "",
        "startDate": project.get("start_date"),
        "endDate": project.get("due_date"),
        "durationDays": project.get("sg_duration_days"),
    }


def onProjectEvent(sg, logger, event, args):
    event_type = event.get("event_type")
    entity = event.get("entity")
    logger.info(f"SG Project event: {event_type} for entity {entity}")

    if event_type == "Shotgun_Project_Retirement":
        meta = event.get("meta", {})
        project_id = entity.get("id") if entity else meta.get("entity_id")
        if not project_id:
            logger.warning("Could not determine Project id for retirement, skipping")
            return
        result = post_to_app("/api/sg/archive/project", {"sgProjectId": project_id}, logger)
        if result:
            logger.info(f"Archived project {project_id}")
        else:
            logger.error(f"Failed to archive project {project_id}")

    elif event_type in ("Shotgun_Project_New", "Shotgun_Project_Change"):
        payload = _build_payload(sg, event)
        if not payload:
            logger.warning("Could not build payload, skipping")
            return
        result = post_to_app("/api/sg/sync/project", payload, logger)
        if result:
            logger.info(f"Synced project {payload['id']}")
        else:
            logger.error(f"Failed to sync project {payload['id']}")