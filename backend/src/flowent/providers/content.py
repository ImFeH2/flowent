from __future__ import annotations

from typing import Any

from flowent.image_assets import (
    encode_image_asset_as_base64,
    encode_image_asset_as_data_url,
)
from flowent.models import (
    ContentPart,
    TextPart,
    content_parts_to_text,
    deserialize_content_parts,
    has_image_parts,
)


def parse_message_content_parts(content: Any) -> list[ContentPart]:
    if isinstance(content, str):
        return [TextPart(text=content)] if content else []
    return deserialize_content_parts(content)


def collapse_parts_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    return content_parts_to_text(parse_message_content_parts(content))


def has_image_content(content: Any) -> bool:
    return has_image_parts(parse_message_content_parts(content))


def to_openai_chat_content(
    content: Any, *, allow_images: bool
) -> str | list[dict[str, Any]]:
    parts = parse_message_content_parts(content)
    if not parts:
        return ""
    if not allow_images or not has_image_parts(parts):
        return content_parts_to_text(parts)
    payload: list[dict[str, Any]] = []
    for part in parts:
        if isinstance(part, TextPart):
            payload.append({"type": "text", "text": part.text})
            continue
        _, data_url = encode_image_asset_as_data_url(part.asset_id)
        payload.append(
            {
                "type": "image_url",
                "image_url": {"url": data_url},
            }
        )
    return payload


def to_openai_responses_content(
    content: Any, *, allow_images: bool
) -> str | list[dict[str, Any]]:
    parts = parse_message_content_parts(content)
    if not parts:
        return ""
    if not allow_images or not has_image_parts(parts):
        return content_parts_to_text(parts)
    payload: list[dict[str, Any]] = []
    for part in parts:
        if isinstance(part, TextPart):
            payload.append({"type": "input_text", "text": part.text})
            continue
        _, data_url = encode_image_asset_as_data_url(part.asset_id)
        payload.append({"type": "input_image", "image_url": data_url})
    return payload


def to_anthropic_content(
    content: Any, *, allow_images: bool
) -> str | list[dict[str, Any]]:
    parts = parse_message_content_parts(content)
    if not parts:
        return ""
    if not allow_images or not has_image_parts(parts):
        return content_parts_to_text(parts)
    payload: list[dict[str, Any]] = []
    for part in parts:
        if isinstance(part, TextPart):
            payload.append({"type": "text", "text": part.text})
            continue
        asset, encoded = encode_image_asset_as_base64(part.asset_id)
        payload.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": asset.mime_type,
                    "data": encoded,
                },
            }
        )
    return payload


def to_gemini_parts(content: Any, *, allow_images: bool) -> list[dict[str, Any]]:
    parts = parse_message_content_parts(content)
    if not parts:
        return [{"text": ""}]
    if not allow_images or not has_image_parts(parts):
        return [{"text": content_parts_to_text(parts)}]
    payload: list[dict[str, Any]] = []
    for part in parts:
        if isinstance(part, TextPart):
            payload.append({"text": part.text})
            continue
        asset, encoded = encode_image_asset_as_base64(part.asset_id)
        payload.append(
            {
                "inlineData": {
                    "mimeType": asset.mime_type,
                    "data": encoded,
                }
            }
        )
    return payload
