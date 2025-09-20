"""API 入出力モデル定義。"""
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreateResponse(BaseModel):
    session_id: UUID = Field(..., description="生成されたセッション ID")


class SessionInput(BaseModel):
    text: str = Field(..., min_length=1, description="Codex CLI への入力")


class SessionOutput(BaseModel):
    session_id: UUID = Field(..., description="対象セッション ID")
    latest_output: str = Field("", description="サーバが確認した最新の標準出力")
