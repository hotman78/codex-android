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
    session_log_dir: Path = Field(
        default_factory=lambda: Path.home() / "logs" / "sessions",
        description="セッションログ保存先ディレクトリ",
    )
    discord_bot_token: str | None = Field(
        default=None,
        description="Discord ボットのトークン (CODEX_WEB_DISCORD_BOT_TOKEN)",
    )
    discord_guild_ids: list[int] = Field(
        default_factory=list,
        description="Slash Command を即時同期するギルド ID のリスト",
    )
    discord_max_concurrency: int = Field(
        default=1,
        ge=1,
        description="同時に処理する Codex 実行数の上限",
    )
    discord_response_ephemeral: bool = Field(
        default=False,
        description="Discord 応答をエフェメラルメッセージとして送信するか",
    )
    discord_auto_channel_ids: list[int] = Field(
        default_factory=list,
        description="自動で Codex を実行するチャンネル ID のリスト",
    )

    discord_context_message_limit: int = Field(
        default=5,
        ge=0,
        le=50,
        description="コンテキストとして参照する直近メッセージ数",
    )

    class Config:
        env_prefix = "CODEX_WEB_"
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
