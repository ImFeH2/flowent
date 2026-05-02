from flowent.providers.openai import _extract_delta_parts


def test_reasoning_field():
    delta = {"reasoning_content": "thinking..."}
    content, thinking = _extract_delta_parts(delta)
    assert content is None
    assert thinking == "thinking..."


def test_content_field():
    delta = {"content": "answer"}
    content, thinking = _extract_delta_parts(delta)
    assert content == "answer"
    assert thinking is None


def test_both_fields():
    delta = {"reasoning_content": "thinking", "content": "answer"}
    content, thinking = _extract_delta_parts(delta)
    assert content == "answer"
    assert thinking == "thinking"
