from fastapi import APIRouter

from app.routes.assistant import router as assistant_router
from app.routes.blueprints import router as blueprints_router
from app.routes.image_assets import router as image_assets_router
from app.routes.meta import router as meta_router
from app.routes.nodes import router as nodes_router
from app.routes.prompts import router as prompts_router
from app.routes.providers_route import router as providers_router
from app.routes.roles import router as roles_router
from app.routes.settings import router as settings_router
from app.routes.stats import router as stats_router
from app.routes.tabs import router as tabs_router
from app.routes.ws import router as ws_router

router = APIRouter()
router.include_router(nodes_router)
router.include_router(assistant_router)
router.include_router(blueprints_router)
router.include_router(image_assets_router)
router.include_router(roles_router)
router.include_router(providers_router)
router.include_router(prompts_router)
router.include_router(settings_router)
router.include_router(stats_router)
router.include_router(tabs_router)
router.include_router(meta_router)
router.include_router(ws_router)
