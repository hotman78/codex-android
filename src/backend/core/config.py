"""アプリケーション設定。"""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    version: str = Field("0.1.0", description="アプリケーションバージョン")
    codex_command: str = Field("codex", description="Codex CLI 実行パス")
    workdir: Path = Field(
        default_factory=lambda: Path.cwd(),
        description="Codex 実行ディレクトリ",
    )
    codex_timeout: float = Field(
        120.0,
        description="codex exec 呼び出しのタイムアウト (秒)",
        ge=1.0,
    )

    class Config:
        env_prefix = "CODEX_WEB_"
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
