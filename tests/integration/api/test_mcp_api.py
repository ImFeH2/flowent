from fastapi.testclient import TestClient

from app.settings import AssistantSettings, MCPServerConfig, Settings


def test_mcp_api_returns_only_external_server_state(client: TestClient, monkeypatch):
    settings = Settings(
        assistant=AssistantSettings(mcp_servers=["filesystem"]),
        mcp_servers=[
            MCPServerConfig(
                name="filesystem",
                transport="stdio",
                command="npx",
                args=["-y", "demo-mcp"],
            )
        ],
    )

    monkeypatch.setattr("app.routes.mcp.get_settings", lambda: settings)
    monkeypatch.setattr("app.routes.mcp.workspace_store.list_tabs", lambda: [])
    monkeypatch.setattr(
        "app.routes.mcp.mcp_service.list_server_payloads",
        lambda: [
            {
                "config": {
                    "name": "filesystem",
                    "transport": "stdio",
                    "enabled": True,
                    "required": False,
                    "startup_timeout_sec": 10,
                    "tool_timeout_sec": 30,
                    "enabled_tools": [],
                    "disabled_tools": [],
                    "scopes": [],
                    "oauth_resource": "",
                    "command": "npx",
                    "args": ["-y", "demo-mcp"],
                    "env": {},
                    "env_vars": [],
                    "cwd": "",
                    "url": "",
                    "bearer_token_env_var": "",
                    "http_headers": {},
                    "env_http_headers": [],
                },
                "snapshot": {
                    "server_name": "filesystem",
                    "transport": "stdio",
                    "status": "connected",
                    "auth_status": "unsupported",
                    "last_auth_result": None,
                    "last_refresh_at": 1710000000,
                    "last_refresh_result": "success",
                    "last_error": None,
                    "tools": [],
                    "resources": [],
                    "resource_templates": [],
                    "prompts": [],
                    "capability_counts": {
                        "tools": 0,
                        "resources": 0,
                        "resource_templates": 0,
                        "prompts": 0,
                    },
                },
                "mounts": {
                    "assistant": True,
                    "tabs": [],
                },
                "activity": [],
            }
        ],
    )

    response = client.get("/api/mcp")

    assert response.status_code == 200
    assert response.json() == {
        "assistant_mcp_servers": ["filesystem"],
        "tabs": [],
        "servers": [
            {
                "config": {
                    "name": "filesystem",
                    "transport": "stdio",
                    "enabled": True,
                    "required": False,
                    "startup_timeout_sec": 10,
                    "tool_timeout_sec": 30,
                    "enabled_tools": [],
                    "disabled_tools": [],
                    "scopes": [],
                    "oauth_resource": "",
                    "command": "npx",
                    "args": ["-y", "demo-mcp"],
                    "env": {},
                    "env_vars": [],
                    "cwd": "",
                    "url": "",
                    "bearer_token_env_var": "",
                    "http_headers": {},
                    "env_http_headers": [],
                },
                "snapshot": {
                    "server_name": "filesystem",
                    "transport": "stdio",
                    "status": "connected",
                    "auth_status": "unsupported",
                    "last_auth_result": None,
                    "last_refresh_at": 1710000000,
                    "last_refresh_result": "success",
                    "last_error": None,
                    "tools": [],
                    "resources": [],
                    "resource_templates": [],
                    "prompts": [],
                    "capability_counts": {
                        "tools": 0,
                        "resources": 0,
                        "resource_templates": 0,
                        "prompts": 0,
                    },
                },
                "mounts": {
                    "assistant": True,
                    "tabs": [],
                },
                "activity": [],
            }
        ],
    }
    assert "autopoe_server" not in response.json()
