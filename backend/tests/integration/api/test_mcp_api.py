from fastapi.testclient import TestClient


def test_mcp_api_returns_only_external_server_state(client: TestClient, monkeypatch):
    monkeypatch.setattr(
        "flowent.routes.mcp.mcp_service.list_server_payloads",
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
                    "launcher": "",
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
                "visibility": {
                    "scope": "global",
                    "active": True,
                },
                "activity": [],
            }
        ],
    )

    response = client.get("/api/mcp")

    assert response.status_code == 200
    assert response.json() == {
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
                    "launcher": "",
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
                "visibility": {
                    "scope": "global",
                    "active": True,
                },
                "activity": [],
            }
        ],
    }
    assert "flowent_server" not in response.json()
