"""FastAPI アプリケーションのエントリーポイント。"""
from fastapi import FastAPI

from .routers import sessions
from ..core.config import settings


def create_app() -> FastAPI:
    """FastAPI アプリのインスタンスを生成する。"""
    app = FastAPI(title="Codex Web Console", version=settings.version)

    app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])

    @app.get("/health", tags=["health"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
