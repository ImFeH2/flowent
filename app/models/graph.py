from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.models.agent import AgentState, NodeConfig, NodeType
from app.models.history import HistoryEntry, deserialize_history_entries
from app.models.todo import TodoItem


@dataclass
class NodePosition:
    x: float
    y: float

    def serialize(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y}

    @classmethod
    def from_mapping(cls, data: dict[str, object] | None) -> NodePosition | None:
        if not isinstance(data, dict):
            return None
        x = data.get("x")
        y = data.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return None
        return cls(x=float(x), y=float(y))


@dataclass
class GraphEdge:
    id: str
    tab_id: str
    from_node_id: str
    to_node_id: str
    created_at: float = field(default_factory=time.time)

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "tab_id": self.tab_id,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "created_at": self.created_at,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> GraphEdge:
        created_at = data.get("created_at")

        return cls(
            id=str(data.get("id", "")),
            tab_id=str(data.get("tab_id", "")),
            from_node_id=str(data.get("from_node_id", "")),
            to_node_id=str(data.get("to_node_id", "")),
            created_at=created_at
            if isinstance(created_at, (int, float))
            else time.time(),
        )


@dataclass
class GraphNodeRecord:
    id: str
    config: NodeConfig
    state: AgentState
    todos: list[TodoItem] = field(default_factory=list)
    history: list[HistoryEntry] = field(default_factory=list)
    position: NodePosition | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "config": {
                "node_type": self.config.node_type.value,
                "role_name": self.config.role_name,
                "tab_id": self.config.tab_id,
                "name": self.config.name,
                "tools": list(self.config.tools),
                "write_dirs": list(self.config.write_dirs),
                "allow_network": self.config.allow_network,
            },
            "state": self.state.value,
            "todos": [item.serialize() for item in self.todos],
            "history": [entry.serialize() for entry in self.history],
            "position": self.position.serialize()
            if self.position is not None
            else None,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> GraphNodeRecord:
        raw_config = data.get("config")
        config = raw_config if isinstance(raw_config, dict) else {}
        raw_todos = data.get("todos")
        raw_history = data.get("history")
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        raw_state = data.get("state")

        node_type = config.get("node_type")
        if node_type == NodeType.ASSISTANT.value:
            parsed_node_type = NodeType.ASSISTANT
        else:
            parsed_node_type = NodeType.AGENT

        try:
            state = AgentState(str(raw_state))
        except ValueError:
            state = AgentState.INITIALIZING

        todos = []
        if isinstance(raw_todos, list):
            todos = [
                TodoItem(text=str(item.get("text", "")))
                for item in raw_todos
                if isinstance(item, dict)
            ]

        history_items: list[HistoryEntry] = []
        if isinstance(raw_history, list):
            history_items = deserialize_history_entries(
                [item for item in raw_history if isinstance(item, dict)]
            )
        raw_position = data.get("position")

        return cls(
            id=str(data.get("id", "")),
            config=NodeConfig(
                node_type=parsed_node_type,
                role_name=(
                    str(config["role_name"])
                    if isinstance(config.get("role_name"), str)
                    else None
                ),
                tab_id=str(config["tab_id"])
                if isinstance(config.get("tab_id"), str)
                else None,
                name=str(config["name"])
                if isinstance(config.get("name"), str)
                else None,
                tools=[
                    str(item)
                    for item in config.get("tools", [])
                    if isinstance(item, str)
                ]
                if isinstance(config.get("tools"), list)
                else [],
                write_dirs=[
                    str(item)
                    for item in config.get("write_dirs", [])
                    if isinstance(item, str)
                ]
                if isinstance(config.get("write_dirs"), list)
                else [],
                allow_network=bool(config.get("allow_network", False)),
            ),
            state=state,
            todos=todos,
            history=history_items,
            position=NodePosition.from_mapping(
                raw_position if isinstance(raw_position, dict) else None
            ),
            created_at=created_at
            if isinstance(created_at, (int, float))
            else time.time(),
            updated_at=updated_at
            if isinstance(updated_at, (int, float))
            else time.time(),
        )
