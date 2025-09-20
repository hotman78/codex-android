"""Codex セッションを管理する API ルータ。"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ...core.session_store import InMemorySessionStore, get_session_store
from ...models.session import SessionCreateResponse, SessionInput, SessionOutput

router = APIRouter()


@router.post("", response_model=SessionCreateResponse)
async def create_session(
    store: InMemorySessionStore = Depends(get_session_store),
) -> SessionCreateResponse:
    """新しい Codex セッションを生成する。"""
    session = await store.create_session()
    return SessionCreateResponse(session_id=session.session_id)


@router.post("/{session_id}/input", response_model=SessionOutput)
async def send_input(
    session_id: UUID,
    payload: SessionInput,
    store: InMemorySessionStore = Depends(get_session_store),
) -> SessionOutput:
    """セッションへ入力を送信し、最新の出力スナップショットを返す。"""
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")

    result = await store.enqueue_input(session.session_id, payload.text)
    return SessionOutput(session_id=session.session_id, latest_output=result)


@router.delete("/{session_id}", status_code=204)
async def close_session(
    session_id: UUID,
    store: InMemorySessionStore = Depends(get_session_store),
) -> None:
    """セッションを停止する。"""
    removed = await store.close_session(session_id)
    if not removed:
        raise HTTPException(status_code=404, detail="session not found")
