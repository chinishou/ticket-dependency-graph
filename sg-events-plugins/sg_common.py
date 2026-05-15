"""Shared utilities for SG → app daemon plugins.

The daemon can serve multiple consuming apps from a single deployment. Each
plugin passes a `plugin_key` (e.g. "TICKET", "HUMANUSER", "PROJECT") when it
calls `post_to_app`; the helper looks up `APP_API_URL_{plugin_key}` first and
falls back to the global `APP_API_URL`. That way one daemon can forward
ticket events to app A and project events to app B without code changes.
"""
import os
import logging
import requests
import time

from dotenv import load_dotenv
load_dotenv()

SG_INTERNAL_SECRET = os.environ.get("SG_INTERNAL_SECRET", "sg-internal-dev-secret")
_DEFAULT_APP_API_URL = os.environ.get("APP_API_URL", "http://localhost:3001")


def _resolve_url(plugin_key=None):
    if plugin_key:
        override = os.environ.get(f"APP_API_URL_{plugin_key}")
        if override:
            return override
    return _DEFAULT_APP_API_URL


def post_to_app(endpoint, payload, logger=None, retries=3, plugin_key=None):
    url = f"{_resolve_url(plugin_key)}{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "x-sg-secret": SG_INTERNAL_SECRET,
    }
    for attempt in range(retries):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code == 200:
                if logger:
                    logger.info(f"App API success: {endpoint} -> {url}")
                return resp.json()
            else:
                if logger:
                    logger.warning(f"App API error {resp.status_code} from {url}: {resp.text[:200]}")
                # Don't retry client errors (except 408 Request Timeout, 429 Too Many Requests)
                if resp.status_code < 500 and resp.status_code not in (408, 429):
                    break
        except requests.RequestException as e:
            if logger:
                logger.warning(f"App API attempt {attempt+1} to {url} failed: {e}")
            if attempt < retries - 1:
                time.sleep(1 * (attempt + 1))
    return None
