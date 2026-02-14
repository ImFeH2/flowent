from app.providers.thinking import ThinkTagParser


def test_normal_thinking_and_content():
    parser = ThinkTagParser()

    results = parser.feed("<think>Let me")
    assert results == [("thinking", "Let me")]

    results = parser.feed(" think</think>")
    assert results == [("thinking", " think")]

    results = parser.feed("This is the answer.")
    assert results == [("content", "This is the answer.")]


def test_newlines_after_think_tags():
    parser = ThinkTagParser()

    result = parser.feed("<think>Thinking with newlines</think>")
    assert result == [("thinking", "Thinking with newlines")]

    results = parser.feed("\n\n\n")
    assert results == []

    results = parser.feed("This is the answer.")
    assert results == [("content", "This is the answer.")]
