from fastapi import APIRouter

from app.routes.assistant import router as assistant_router
from app.routes.graphs import router as graphs_router
from app.routes.meta import router as meta_router
from app.routes.nodes import router as nodes_router
from app.routes.prompts import router as prompts_router
from app.routes.providers_route import router as providers_router
from app.routes.roles import router as roles_router
from app.routes.settings import router as settings_router
from app.routes.ws import router as ws_router

router = APIRouter()
router.include_router(nodes_router)
router.include_router(assistant_router)
router.include_router(graphs_router)
router.include_router(roles_router)
router.include_router(providers_router)
router.include_router(prompts_router)
router.include_router(settings_router)
router.include_router(meta_router)
router.include_router(ws_router)
