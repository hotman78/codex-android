"""セッション管理のメモリ内実装。"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID, uuid4

from .config import settings
from ..services.codex_client import CodexClient, CodexConfig, CodexExecutionError


TERMINATE_MESSAGE = "__CLOSE__"


@dataclass
class Session:
    session_id: UUID
    latest_output: str = ""
    queue: asyncio.Queue[str] = field(default_factory=asyncio.Queue)
    response_queue: asyncio.Queue[str] = field(default_factory=asyncio.Queue)


class InMemorySessionStore:
    """Codex セッションを保持するシンプルなストア。"""

    def __init__(
        self,
        codex_runner: Callable[[Session], Awaitable[str]],
        response_timeout: float = 5.0,
    ):
        self._codex_runner = codex_runner
        self._sessions: dict[UUID, Session] = {}
        self._lock = asyncio.Lock()
        self._response_timeout = response_timeout

    async def create_session(self) -> Session:
        async with self._lock:
            session = Session(session_id=uuid4())
            self._sessions[session.session_id] = session
            asyncio.create_task(self._codex_runner(session))
            return session

    async def get_session(self, session_id: UUID) -> Optional[Session]:
        async with self._lock:
            return self._sessions.get(session_id)

    async def enqueue_input(self, session_id: UUID, text: str) -> str:
        session = await self.get_session(session_id)
        if session is None:
            raise KeyError("session not found")

        await session.queue.put(text)
        try:
            output = await asyncio.wait_for(
                session.response_queue.get(), timeout=self._response_timeout
            )
            if output == TERMINATE_MESSAGE:
                raise RuntimeError("session closed")
            session.latest_output = output
            return output
        except asyncio.TimeoutError:
            return session.latest_output

    async def update_output(self, session_id: UUID, output: str) -> None:
        session = await self.get_session(session_id)
        if session:
            session.latest_output = output
            await session.response_queue.put(output)

    async def close_session(self, session_id: UUID) -> bool:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            await session.queue.put(TERMINATE_MESSAGE)
            await session.response_queue.put(TERMINATE_MESSAGE)
            return True
        return False


logger = logging.getLogger(__name__)


_codex_client: CodexClient | None = None


def get_codex_client() -> CodexClient:
    global _codex_client
    if _codex_client is None:
        _codex_client = CodexClient(
            CodexConfig(
                command=settings.codex_command,
                workdir=settings.workdir,
                timeout=settings.codex_timeout,
            )
        )
    return _codex_client


async def codex_runner(session: Session) -> str:
    """Codex CLI と連携してレスポンスを取得する。"""
    client = get_codex_client()
    while True:
        text = await session.queue.get()
        if text == TERMINATE_MESSAGE:
            break
        try:
            response = await client.run(text)
        except CodexExecutionError as exc:
            logger.exception("codex exec failed")
            response = f"[codex-error] {exc}"
        session.latest_output = response
        await session.response_queue.put(session.latest_output)
    return session.latest_output


_session_store: InMemorySessionStore | None = None


async def get_session_store() -> InMemorySessionStore:
    """DI 用のシングルトンストア取得。"""
    global _session_store
    if _session_store is None:
        _session_store = InMemorySessionStore(
            codex_runner=codex_runner,
            response_timeout=settings.codex_timeout + 5,
        )
    return _session_store
