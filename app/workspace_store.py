from __future__ import annotations

import json
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.models import GraphEdge, GraphNodeRecord, Tab


def _get_workspace_file() -> Path:
    from app import settings as settings_module

    return settings_module._SETTINGS_FILE.parent / "workspace.json"


@dataclass
class WorkspaceSnapshot:
    tabs: dict[str, Tab] = field(default_factory=dict)
    nodes: dict[str, GraphNodeRecord] = field(default_factory=dict)
    edges: dict[str, GraphEdge] = field(default_factory=dict)

    def serialize(self) -> dict[str, object]:
        return {
            "tabs": [tab.serialize() for tab in self.tabs.values()],
            "nodes": [node.serialize() for node in self.nodes.values()],
            "edges": [edge.serialize() for edge in self.edges.values()],
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> WorkspaceSnapshot:
        raw_tabs = data.get("tabs")
        raw_nodes = data.get("nodes")
        raw_edges = data.get("edges")
        tabs = {
            tab.id: tab
            for tab in (
                Tab.from_mapping(item)
                for item in (raw_tabs if isinstance(raw_tabs, list) else [])
                if isinstance(item, dict)
            )
        }
        nodes = {
            node.id: node
            for node in (
                GraphNodeRecord.from_mapping(item)
                for item in (raw_nodes if isinstance(raw_nodes, list) else [])
                if isinstance(item, dict)
            )
        }
        edges = {
            edge.id: edge
            for edge in (
                GraphEdge.from_mapping(item)
                for item in (raw_edges if isinstance(raw_edges, list) else [])
                if isinstance(item, dict)
            )
        }
        return cls(tabs=tabs, nodes=nodes, edges=edges)


class WorkspaceStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._snapshot: WorkspaceSnapshot | None = None

    def _load_snapshot(self) -> WorkspaceSnapshot:
        if self._snapshot is not None:
            return self._snapshot
        workspace_file = _get_workspace_file()
        if not workspace_file.exists():
            self._snapshot = WorkspaceSnapshot()
            return self._snapshot
        raw = json.loads(workspace_file.read_text(encoding="utf-8"))
        snapshot = (
            WorkspaceSnapshot.from_mapping(raw)
            if isinstance(raw, dict)
            else WorkspaceSnapshot()
        )
        self._snapshot = snapshot
        return snapshot

    def _persist_snapshot(self, snapshot: WorkspaceSnapshot) -> None:
        workspace_file = _get_workspace_file()
        workspace_file.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w",
            dir=workspace_file.parent,
            delete=False,
            encoding="utf-8",
        ) as handle:
            handle.write(
                json.dumps(snapshot.serialize(), ensure_ascii=False, indent=2) + "\n"
            )
            temp_path = Path(handle.name)
        temp_path.replace(workspace_file)

    def reset_cache(self) -> None:
        with self._lock:
            self._snapshot = None

    def list_tabs(self) -> list[Tab]:
        with self._lock:
            return list(self._load_snapshot().tabs.values())

    def get_tab(self, tab_id: str) -> Tab | None:
        with self._lock:
            return self._load_snapshot().tabs.get(tab_id)

    def upsert_tab(self, tab: Tab) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            tab.updated_at = time.time()
            snapshot.tabs[tab.id] = tab
            self._persist_snapshot(snapshot)

    def delete_tab(self, tab_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            snapshot.tabs.pop(tab_id, None)
            node_ids = [
                node_id
                for node_id, node in snapshot.nodes.items()
                if node.config.tab_id == tab_id
            ]
            for node_id in node_ids:
                snapshot.nodes.pop(node_id, None)
            edge_ids = [
                edge_id
                for edge_id, edge in snapshot.edges.items()
                if edge.tab_id == tab_id
                or edge.from_node_id in node_ids
                or edge.to_node_id in node_ids
            ]
            for edge_id in edge_ids:
                snapshot.edges.pop(edge_id, None)
            self._persist_snapshot(snapshot)

    def list_node_records(self, tab_id: str | None = None) -> list[GraphNodeRecord]:
        with self._lock:
            nodes = list(self._load_snapshot().nodes.values())
            if tab_id is None:
                return nodes
            return [node for node in nodes if node.config.tab_id == tab_id]

    def get_node_record(self, node_id: str) -> GraphNodeRecord | None:
        with self._lock:
            return self._load_snapshot().nodes.get(node_id)

    def upsert_node_record(self, record: GraphNodeRecord) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            record.updated_at = time.time()
            snapshot.nodes[record.id] = record
            if record.config.tab_id and record.config.tab_id in snapshot.tabs:
                snapshot.tabs[record.config.tab_id].updated_at = record.updated_at
            self._persist_snapshot(snapshot)

    def delete_node_record(self, node_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            record = snapshot.nodes.pop(node_id, None)
            if record is None:
                return
            edge_ids = [
                edge_id
                for edge_id, edge in snapshot.edges.items()
                if edge.from_node_id == node_id or edge.to_node_id == node_id
            ]
            for edge_id in edge_ids:
                snapshot.edges.pop(edge_id, None)
            if record.config.tab_id and record.config.tab_id in snapshot.tabs:
                snapshot.tabs[record.config.tab_id].updated_at = time.time()
            self._persist_snapshot(snapshot)

    def list_edges(self, tab_id: str | None = None) -> list[GraphEdge]:
        with self._lock:
            edges = list(self._load_snapshot().edges.values())
            if tab_id is None:
                return edges
            return [edge for edge in edges if edge.tab_id == tab_id]

    def get_edge(self, edge_id: str) -> GraphEdge | None:
        with self._lock:
            return self._load_snapshot().edges.get(edge_id)

    def upsert_edge(self, edge: GraphEdge) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            snapshot.edges[edge.id] = edge
            if edge.tab_id in snapshot.tabs:
                snapshot.tabs[edge.tab_id].updated_at = time.time()
            self._persist_snapshot(snapshot)

    def delete_edge(self, edge_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            edge = snapshot.edges.pop(edge_id, None)
            if edge is None:
                return
            if edge.tab_id in snapshot.tabs:
                snapshot.tabs[edge.tab_id].updated_at = time.time()
            self._persist_snapshot(snapshot)


workspace_store = WorkspaceStore()
