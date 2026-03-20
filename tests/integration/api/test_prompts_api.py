from fastapi.testclient import TestClient

from app.settings import Settings


def test_prompts_api_reads_and_updates_custom_prompt(
    client: TestClient,
    monkeypatch,
):
    settings = Settings(
        custom_prompt="Initial global prompt.",
        custom_post_prompt="Initial runtime prompt.",
    )
    saved: list[tuple[str, str]] = []

    monkeypatch.setattr("app.routes.prompts.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.prompts.save_settings",
        lambda current: saved.append(
            (current.custom_prompt, current.custom_post_prompt)
        ),
    )

    get_response = client.get("/api/prompts")

    assert get_response.status_code == 200
    assert get_response.json() == {
        "custom_prompt": "Initial global prompt.",
        "custom_post_prompt": "Initial runtime prompt.",
    }

    put_response = client.put(
        "/api/prompts",
        json={
            "custom_prompt": "Updated global prompt.",
            "custom_post_prompt": "Updated runtime prompt.",
        },
    )

    assert put_response.status_code == 200
    assert put_response.json() == {
        "custom_prompt": "Updated global prompt.",
        "custom_post_prompt": "Updated runtime prompt.",
    }
    assert settings.custom_prompt == "Updated global prompt."
    assert settings.custom_post_prompt == "Updated runtime prompt."
    assert saved == [("Updated global prompt.", "Updated runtime prompt.")]
