from __future__ import annotations

import base64
import json
import struct
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

from flowent_api.state_db import (
    get_images_dir,
    get_legacy_image_assets_dir,
    open_state_db,
)

ALLOWED_IMAGE_MIME_TYPES = frozenset(
    {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
    }
)

_IMAGE_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


@dataclass(frozen=True)
class ImageAsset:
    id: str
    stored_name: str
    mime_type: str
    width: int | None = None
    height: int | None = None
    original_name: str | None = None

    @property
    def file_path(self) -> Path:
        return _get_assets_dir() / self.stored_name

    @property
    def url_path(self) -> str:
        return f"/api/image-assets/{self.id}"

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "stored_name": self.stored_name,
            "mime_type": self.mime_type,
            "width": self.width,
            "height": self.height,
            "original_name": self.original_name,
            "url": self.url_path,
        }


def _get_assets_dir() -> Path:
    return get_images_dir()


def _get_legacy_metadata_path(asset_id: str) -> Path:
    return get_legacy_image_assets_dir() / f"{asset_id}.json"


def _get_legacy_file_path(stored_name: str) -> Path:
    return get_legacy_image_assets_dir() / stored_name


def _detect_mime_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _normalize_mime_type(data: bytes, mime_type: str | None) -> str:
    normalized = mime_type.strip().lower() if isinstance(mime_type, str) else ""
    if normalized in ALLOWED_IMAGE_MIME_TYPES:
        return normalized
    detected = _detect_mime_type(data)
    if detected is not None:
        return detected
    raise ValueError("Unsupported image type. Allowed types: PNG, JPEG, GIF, WEBP.")


def _read_png_size(data: bytes) -> tuple[int | None, int | None]:
    if len(data) < 24:
        return None, None
    if data[12:16] != b"IHDR":
        return None, None
    width = struct.unpack(">I", data[16:20])[0]
    height = struct.unpack(">I", data[20:24])[0]
    return width, height


def _read_gif_size(data: bytes) -> tuple[int | None, int | None]:
    if len(data) < 10:
        return None, None
    width, height = struct.unpack("<HH", data[6:10])
    return width, height


def _read_jpeg_size(data: bytes) -> tuple[int | None, int | None]:
    if len(data) < 4 or not data.startswith(b"\xff\xd8"):
        return None, None
    offset = 2
    while offset + 1 < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        marker = data[offset + 1]
        offset += 2
        if marker in {0xD8, 0xD9}:
            continue
        if offset + 2 > len(data):
            break
        segment_length = struct.unpack(">H", data[offset : offset + 2])[0]
        if segment_length < 2 or offset + segment_length > len(data):
            break
        if marker in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            if offset + 7 > len(data):
                break
            height = struct.unpack(">H", data[offset + 3 : offset + 5])[0]
            width = struct.unpack(">H", data[offset + 5 : offset + 7])[0]
            return width, height
        offset += segment_length
    return None, None


def _read_webp_size(data: bytes) -> tuple[int | None, int | None]:
    if len(data) < 30 or not data.startswith(b"RIFF") or data[8:12] != b"WEBP":
        return None, None
    chunk_type = data[12:16]
    if chunk_type == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if chunk_type == b"VP8L" and len(data) >= 25:
        value = int.from_bytes(data[21:25], "little")
        width = (value & 0x3FFF) + 1
        height = ((value >> 14) & 0x3FFF) + 1
        return width, height
    return None, None


def _read_image_size(data: bytes, mime_type: str) -> tuple[int | None, int | None]:
    if mime_type == "image/png":
        return _read_png_size(data)
    if mime_type == "image/jpeg":
        return _read_jpeg_size(data)
    if mime_type == "image/gif":
        return _read_gif_size(data)
    if mime_type == "image/webp":
        return _read_webp_size(data)
    return None, None


def create_image_asset(
    data: bytes,
    *,
    mime_type: str | None = None,
    original_name: str | None = None,
) -> ImageAsset:
    if not data:
        raise ValueError("Image file is empty.")
    normalized_mime_type = _normalize_mime_type(data, mime_type)
    width, height = _read_image_size(data, normalized_mime_type)
    asset_id = str(uuid.uuid4())
    extension = _IMAGE_EXTENSIONS[normalized_mime_type]
    stored_name = f"{asset_id}{extension}"
    asset = ImageAsset(
        id=asset_id,
        stored_name=stored_name,
        mime_type=normalized_mime_type,
        width=width,
        height=height,
        original_name=original_name or None,
    )
    asset_dir = _get_assets_dir()
    asset_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile("wb", dir=asset_dir, delete=False) as handle:
        handle.write(data)
        temp_file_path = Path(handle.name)
    temp_file_path.replace(asset.file_path)
    _persist_image_asset(asset)
    return asset


def get_image_asset(asset_id: str) -> ImageAsset | None:
    if not asset_id.strip():
        return None
    asset = _load_persisted_image_asset(asset_id)
    if asset is not None:
        if asset.file_path.is_file():
            return asset
        if _restore_legacy_image_file(asset):
            return asset
        return None
    legacy_asset = _load_legacy_image_asset(asset_id)
    if legacy_asset is None:
        return None
    _persist_image_asset(legacy_asset)
    if _restore_legacy_image_file(legacy_asset):
        return legacy_asset
    return None


def _persist_image_asset(asset: ImageAsset) -> None:
    connection = open_state_db(create=True)
    assert connection is not None
    try:
        with connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO image_assets (
                    id,
                    stored_name,
                    mime_type,
                    width,
                    height,
                    original_name
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    asset.id,
                    asset.stored_name,
                    asset.mime_type,
                    asset.width,
                    asset.height,
                    asset.original_name,
                ),
            )
    finally:
        connection.close()


def _load_persisted_image_asset(asset_id: str) -> ImageAsset | None:
    connection = open_state_db(create=False)
    if connection is None:
        return None
    try:
        row = connection.execute(
            """
            SELECT id, stored_name, mime_type, width, height, original_name
            FROM image_assets
            WHERE id = ?
            """,
            (asset_id,),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        return None
    return ImageAsset(
        id=row["id"],
        stored_name=row["stored_name"],
        mime_type=row["mime_type"],
        width=row["width"] if isinstance(row["width"], int) else None,
        height=row["height"] if isinstance(row["height"], int) else None,
        original_name=(
            row["original_name"] if isinstance(row["original_name"], str) else None
        ),
    )


def _load_legacy_image_asset(asset_id: str) -> ImageAsset | None:
    metadata_path = _get_legacy_metadata_path(asset_id)
    if not metadata_path.is_file():
        return None
    raw = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return None
    stored_name = raw.get("stored_name")
    mime_type = raw.get("mime_type")
    if not isinstance(stored_name, str) or not isinstance(mime_type, str):
        return None
    if not _get_legacy_file_path(stored_name).is_file():
        return None
    return ImageAsset(
        id=asset_id,
        stored_name=stored_name,
        mime_type=mime_type,
        width=raw.get("width") if isinstance(raw.get("width"), int) else None,
        height=raw.get("height") if isinstance(raw.get("height"), int) else None,
        original_name=(
            raw.get("original_name")
            if isinstance(raw.get("original_name"), str)
            else None
        ),
    )


def _restore_legacy_image_file(asset: ImageAsset) -> bool:
    target_path = asset.file_path
    if target_path.is_file():
        return True
    legacy_file_path = _get_legacy_file_path(asset.stored_name)
    if not legacy_file_path.is_file():
        return False
    asset_dir = _get_assets_dir()
    asset_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", dir=asset_dir, delete=False) as handle:
        handle.write(legacy_file_path.read_bytes())
        temp_file_path = Path(handle.name)
    temp_file_path.replace(target_path)
    return True


def require_image_asset(asset_id: str) -> ImageAsset:
    asset = get_image_asset(asset_id)
    if asset is None:
        raise ValueError(f"Unknown image asset `{asset_id}`.")
    return asset


def read_image_asset_bytes(asset_id: str) -> tuple[ImageAsset, bytes]:
    asset = require_image_asset(asset_id)
    return asset, asset.file_path.read_bytes()


def encode_image_asset_as_data_url(asset_id: str) -> tuple[ImageAsset, str]:
    asset, data = read_image_asset_bytes(asset_id)
    encoded = base64.b64encode(data).decode("ascii")
    return asset, f"data:{asset.mime_type};base64,{encoded}"


def encode_image_asset_as_base64(asset_id: str) -> tuple[ImageAsset, str]:
    asset, data = read_image_asset_bytes(asset_id)
    encoded = base64.b64encode(data).decode("ascii")
    return asset, encoded
