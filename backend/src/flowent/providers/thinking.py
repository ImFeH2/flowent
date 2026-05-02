from __future__ import annotations


class ThinkTagParser:
    OPEN_TAG = "<think>"
    CLOSE_TAG = "</think>"

    def __init__(self) -> None:
        self._inside = False
        self._pending = ""
        self._skip_newlines = False

    def feed(self, text: str) -> list[tuple[str, str]]:
        if self._skip_newlines:
            text = text.lstrip("\n")
            if not text:
                return []
            self._skip_newlines = False
        self._pending += text
        return self._drain()

    def flush(self) -> list[tuple[str, str]]:
        if not self._pending:
            return []
        chunk_type = "thinking" if self._inside else "content"
        result = [(chunk_type, self._pending)]
        self._pending = ""
        return result

    def _drain(self) -> list[tuple[str, str]]:
        results: list[tuple[str, str]] = []
        while self._pending:
            tag = self.CLOSE_TAG if self._inside else self.OPEN_TAG
            idx = self._pending.find(tag)
            if idx >= 0:
                before = self._pending[:idx]
                if before:
                    chunk_type = "thinking" if self._inside else "content"
                    results.append((chunk_type, before))
                self._pending = self._pending[idx + len(tag) :]
                self._inside = not self._inside
                self._pending = self._pending.lstrip("\n")
                if not self._pending:
                    self._skip_newlines = True
                continue

            for n in range(min(len(tag) - 1, len(self._pending)), 0, -1):
                if self._pending.endswith(tag[:n]):
                    safe = self._pending[:-n]
                    if safe:
                        chunk_type = "thinking" if self._inside else "content"
                        results.append((chunk_type, safe))
                    self._pending = self._pending[-n:]
                    return results

            chunk_type = "thinking" if self._inside else "content"
            results.append((chunk_type, self._pending))
            self._pending = ""

        return results


def split_thinking_content(text: str) -> tuple[str, str]:
    parser = ThinkTagParser()
    chunks = parser.feed(text)
    chunks.extend(parser.flush())

    content_parts: list[str] = []
    thinking_parts: list[str] = []

    for chunk_type, chunk_text in chunks:
        if not chunk_text:
            continue
        if chunk_type == "thinking":
            thinking_parts.append(chunk_text)
        else:
            content_parts.append(chunk_text)

    return "".join(content_parts), "".join(thinking_parts)
