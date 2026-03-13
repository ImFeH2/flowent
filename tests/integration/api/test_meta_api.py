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
    assert "spawn" in tool_names
