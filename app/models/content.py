from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.base import Serializable


@dataclass
class TextPart(Serializable):
    text: str

    def serialize(self) -> dict[str, Any]:
        return {"type": "text", "text": self.text}


@dataclass
class ImagePart(Serializable):
    asset_id: str
    mime_type: str | None = None
    width: int | None = None
    height: int | None = None
    alt: str | None = None

    def serialize(self) -> dict[str, Any]:
        return {
            "type": "image",
            "asset_id": self.asset_id,
            "mime_type": self.mime_type,
            "width": self.width,
            "height": self.height,
            "alt": self.alt,
        }


ContentPart = TextPart | ImagePart


def fallback_text_parts(content: str | None) -> list[ContentPart]:
    if not isinstance(content, str) or not content:
        return []
    return [TextPart(text=content)]


def deserialize_content_parts(
    raw_parts: Any,
    *,
    fallback_text: str | None = None,
) -> list[ContentPart]:
    if not isinstance(raw_parts, list):
        return fallback_text_parts(fallback_text)

    parts: list[ContentPart] = []
    for raw_part in raw_parts:
        if not isinstance(raw_part, dict):
            continue
        part_type = raw_part.get("type")
        if part_type == "TextPart":
            part_type = "text"
        if part_type == "ImagePart":
            part_type = "image"

        if part_type == "text":
            text = raw_part.get("text")
            if isinstance(text, str):
                parts.append(TextPart(text=text))
            continue

        if part_type == "image":
            asset_id = raw_part.get("asset_id")
            if not isinstance(asset_id, str) or not asset_id:
                continue
            width = raw_part.get("width")
            height = raw_part.get("height")
            parts.append(
                ImagePart(
                    asset_id=asset_id,
                    mime_type=(
                        str(raw_part["mime_type"])
                        if isinstance(raw_part.get("mime_type"), str)
                        else None
                    ),
                    width=width if isinstance(width, int) else None,
                    height=height if isinstance(height, int) else None,
                    alt=(
                        str(raw_part["alt"])
                        if isinstance(raw_part.get("alt"), str)
                        else None
                    ),
                )
            )

    if parts:
        return parts
    return fallback_text_parts(fallback_text)


def parse_content_parts_payload(raw_parts: Any) -> list[ContentPart]:
    if not isinstance(raw_parts, list) or not raw_parts:
        raise ValueError("send.parts must be a non-empty array")

    parts: list[ContentPart] = []
    for index, raw_part in enumerate(raw_parts):
        if not isinstance(raw_part, dict):
            raise ValueError(f"send.parts[{index}] must be an object")

        part_type = raw_part.get("type")
        if part_type == "text":
            text = raw_part.get("text")
            if not isinstance(text, str):
                raise ValueError(f"send.parts[{index}].text must be a string")
            parts.append(TextPart(text=text))
            continue

        if part_type == "image":
            asset_id = raw_part.get("asset_id")
            if not isinstance(asset_id, str) or not asset_id:
                raise ValueError(
                    f"send.parts[{index}].asset_id must be a non-empty string"
                )
            width = raw_part.get("width")
            height = raw_part.get("height")
            if width is not None and not isinstance(width, int):
                raise ValueError(f"send.parts[{index}].width must be an integer")
            if height is not None and not isinstance(height, int):
                raise ValueError(f"send.parts[{index}].height must be an integer")
            mime_type = raw_part.get("mime_type")
            if mime_type is not None and not isinstance(mime_type, str):
                raise ValueError(f"send.parts[{index}].mime_type must be a string")
            alt = raw_part.get("alt")
            if alt is not None and not isinstance(alt, str):
                raise ValueError(f"send.parts[{index}].alt must be a string")
            parts.append(
                ImagePart(
                    asset_id=asset_id,
                    mime_type=mime_type,
                    width=width,
                    height=height,
                    alt=alt,
                )
            )
            continue

        raise ValueError(f"send.parts[{index}].type must be either `text` or `image`")

    return parts


def content_parts_to_text(parts: list[ContentPart]) -> str:
    text_parts: list[str] = []
    for part in parts:
        if isinstance(part, TextPart):
            text_parts.append(part.text)
            continue
        if isinstance(part, ImagePart):
            if part.alt:
                text_parts.append(f"[image: {part.alt}]")
            else:
                text_parts.append("[image]")
    return "".join(text_parts)


def has_image_parts(parts: list[ContentPart]) -> bool:
    return any(isinstance(part, ImagePart) for part in parts)
