from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.image_assets import create_image_asset, get_image_asset

router = APIRouter()
image_upload_file = File(...)


@router.post("/api/image-assets")
async def upload_image_asset(
    file: UploadFile = image_upload_file,
) -> dict[str, object]:
    try:
        data = await file.read()
        asset = create_image_asset(
            data,
            mime_type=file.content_type,
            original_name=file.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return asset.serialize()


@router.get("/api/image-assets/{asset_id}")
async def get_uploaded_image_asset(asset_id: str) -> FileResponse:
    asset = get_image_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Image asset not found")
    return FileResponse(asset.file_path, media_type=asset.mime_type)
