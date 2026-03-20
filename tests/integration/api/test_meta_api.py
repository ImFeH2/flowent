from fastapi.testclient import TestClient


def test_tools_api_hides_assistant_only_tools(client: TestClient):
    response = client.get("/api/tools")

    assert response.status_code == 200
    tool_names = {tool["name"] for tool in response.json()["tools"]}
    assert "create_root" not in tool_names
    assert "manage_providers" not in tool_names
    assert "manage_roles" not in tool_names
    assert "manage_settings" not in tool_names
    assert "manage_prompts" not in tool_names
    assert "send" not in tool_names
    assert "sleep" in tool_names
    assert "spawn" in tool_names
    assert "connect" in tool_names


def test_settings_bootstrap_returns_settings_related_resources(client: TestClient):
    response = client.get("/api/settings/bootstrap")

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"]
    assert "settings" in payload
    assert "providers" in payload
    assert "roles" in payload
    role_names = {role["name"] for role in payload["roles"]}
    assert "Steward" in role_names
    assert "Worker" in role_names
