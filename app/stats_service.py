from __future__ import annotations

import copy
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from app.models import LLMUsage

MAX_STATS_RETENTION_SECONDS = 30 * 24 * 60 * 60


def serialize_usage(usage: LLMUsage | None) -> dict[str, Any] | None:
    if usage is None:
        return None
    return {
        "total_tokens": usage.total_tokens,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cached_input_tokens": usage.cached_input_tokens,
        "cache_read_tokens": usage.cache_read_tokens,
        "cache_write_tokens": usage.cache_write_tokens,
        "details": dict(usage.details),
    }


@dataclass(frozen=True)
class RequestRecordInput:
    node_id: str
    node_label: str
    role_name: str | None
    tab_id: str | None
    tab_title: str | None
    provider_id: str | None
    provider_name: str | None
    provider_type: str | None
    model: str | None
    started_at: float
    ended_at: float
    retry_count: int
    result: Literal["success", "error"]
    normalized_usage: LLMUsage | None = None
    raw_usage: dict[str, Any] | None = None
    error_summary: str | None = None


@dataclass(frozen=True)
class CompactRecordInput:
    node_id: str
    node_label: str
    role_name: str | None
    tab_id: str | None
    tab_title: str | None
    provider_id: str | None
    provider_name: str | None
    provider_type: str | None
    model: str | None
    trigger_type: Literal["manual", "auto"]
    started_at: float
    ended_at: float
    result: Literal["success", "error"]
    error_summary: str | None = None


class StatsStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._request_records: list[dict[str, Any]] = []
        self._compact_records: list[dict[str, Any]] = []

    def reset(self) -> None:
        with self._lock:
            self._request_records.clear()
            self._compact_records.clear()

    def _prune_locked(self, now: float) -> None:
        min_timestamp = now - MAX_STATS_RETENTION_SECONDS
        self._request_records = [
            record
            for record in self._request_records
            if record["ended_at"] >= min_timestamp
        ]
        self._compact_records = [
            record
            for record in self._compact_records
            if record["ended_at"] >= min_timestamp
        ]

    def record_request(self, record: RequestRecordInput) -> None:
        with self._lock:
            now = time.time()
            self._prune_locked(now)
            self._request_records.append(
                {
                    "id": str(uuid.uuid4()),
                    "node_id": record.node_id,
                    "node_label": record.node_label,
                    "role_name": record.role_name,
                    "tab_id": record.tab_id,
                    "tab_title": record.tab_title,
                    "provider_id": record.provider_id,
                    "provider_name": record.provider_name,
                    "provider_type": record.provider_type,
                    "model": record.model,
                    "started_at": record.started_at,
                    "ended_at": record.ended_at,
                    "duration_ms": max(
                        0.0, (record.ended_at - record.started_at) * 1000
                    ),
                    "retry_count": max(record.retry_count, 0),
                    "result": record.result,
                    "error_summary": record.error_summary,
                    "normalized_usage": serialize_usage(record.normalized_usage),
                    "raw_usage": copy.deepcopy(record.raw_usage),
                }
            )

    def record_compact(self, record: CompactRecordInput) -> None:
        with self._lock:
            now = time.time()
            self._prune_locked(now)
            self._compact_records.append(
                {
                    "id": str(uuid.uuid4()),
                    "node_id": record.node_id,
                    "node_label": record.node_label,
                    "role_name": record.role_name,
                    "tab_id": record.tab_id,
                    "tab_title": record.tab_title,
                    "provider_id": record.provider_id,
                    "provider_name": record.provider_name,
                    "provider_type": record.provider_type,
                    "model": record.model,
                    "trigger_type": record.trigger_type,
                    "started_at": record.started_at,
                    "ended_at": record.ended_at,
                    "duration_ms": max(
                        0.0, (record.ended_at - record.started_at) * 1000
                    ),
                    "result": record.result,
                    "error_summary": record.error_summary,
                }
            )

    def list_requests(self, *, since: float) -> list[dict[str, Any]]:
        with self._lock:
            return [
                copy.deepcopy(record)
                for record in self._request_records
                if record["ended_at"] >= since
            ]

    def list_compacts(self, *, since: float) -> list[dict[str, Any]]:
        with self._lock:
            return [
                copy.deepcopy(record)
                for record in self._compact_records
                if record["ended_at"] >= since
            ]


stats_store = StatsStore()
