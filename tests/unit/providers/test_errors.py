from app.providers.errors import (
    build_access_blocked_error,
    build_network_error,
    build_status_error,
)


class ConnectTimeoutError(Exception):
    pass


def test_build_status_error_extracts_brief_json_detail():
    error = build_status_error(
        provider_name="Test Provider",
        provider_type="openai",
        model="gpt-5.2",
        base_url="http://example.invalid",
        status_code=401,
        body='{"error":{"message":"Invalid API key provided","type":"invalid_request_error"}}',
    )

    assert "Detail: Invalid API key provided" in str(error)
    assert '"invalid_request_error"' not in str(error)
    assert '{"error"' not in str(error)


def test_build_network_error_omits_local_exception_class_name():
    error = build_network_error(
        provider_name="Test Provider",
        provider_type="openai",
        model="gpt-5.2",
        base_url="http://example.invalid",
        error=ConnectTimeoutError("Connection timed out while contacting upstream"),
    )

    assert "Error: Connection timed out while contacting upstream" in str(error)
    assert "ConnectTimeoutError" not in str(error)


def test_build_access_blocked_error_hides_html_body():
    error = build_access_blocked_error(
        provider_name="Test Provider",
        provider_type="openai",
        model="gpt-5.2",
        base_url="http://example.invalid",
        status_code=403,
        detail="<title>Just a moment...</title>",
    )

    assert "LLM API access blocked" in str(error)
    assert "Status: 403" in str(error)
    assert "Detail: Challenge or interstitial HTML response from upstream" in str(error)
    assert "<title>" not in str(error)
