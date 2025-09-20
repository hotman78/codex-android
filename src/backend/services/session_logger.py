"""セッションイベントを JSONL へ追記するロガー。"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID

from ..core.config import settings

LogStream = Literal["input", "output", "status"]


class SessionLogger:
    """セッションの入出力を日次 JSONL へ保存する。"""

    def __init__(self, base_dir: Path | None = None) -> None:
        self._base_dir = base_dir or settings.session_log_dir
        self._lock = asyncio.Lock()

    async def log_event(self, session_id: UUID, stream: LogStream, text: str) -> None:
        """セッションイベントを追記する。"""
        timestamp = datetime.now(timezone.utc)
        payload = {
            "timestamp": timestamp.isoformat(),
            "session_id": str(session_id),
            "stream": stream,
            "text": text,
        }
        line = json.dumps(payload, ensure_ascii=False)
        path = self._log_path_for(timestamp)
        async with self._lock:
            await asyncio.to_thread(self._append_line, path, line)

    def _log_path_for(self, timestamp: datetime) -> Path:
        day = timestamp.strftime("%Y-%m-%d")
        return self._base_dir / f"{day}.jsonl"

    def _append_line(self, path: Path, line: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as file:
            file.write(line + "\n")


_session_logger: SessionLogger | None = None


def get_session_logger() -> SessionLogger:
    """DI 用シングルトンロガー。"""
    global _session_logger
    if _session_logger is None:
        _session_logger = SessionLogger()
    return _session_logger


__all__ = ["SessionLogger", "get_session_logger"]
