"""Shared utilities for SG → ticket-dependency-graph daemon plugins."""
import os
import logging
import requests
import time

from dotenv import load_dotenv
load_dotenv()

SG_INTERNAL_SECRET = os.environ.get("SG_INTERNAL_SECRET", "sg-internal-dev-secret")
APP_API_URL = os.environ.get("APP_API_URL", "http://localhost:3001")


def post_to_app(endpoint, payload, logger=None, retries=3):
    url = f"{APP_API_URL}{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "x-sg-secret": SG_INTERNAL_SECRET,
    }
    for attempt in range(retries):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code == 200:
                if logger:
                    logger.info(f"App API success: {endpoint}")
                return resp.json()
            else:
                if logger:
                    logger.warning(f"App API error {resp.status_code}: {resp.text[:200]}")
                # Don't retry client errors (except 408 Request Timeout, 429 Too Many Requests)
                if resp.status_code < 500 and resp.status_code not in (408, 429):
                    break
        except requests.RequestException as e:
            if logger:
                logger.warning(f"App API attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(1 * (attempt + 1))
    return None