"""Codex CLI との非同期連携ユーティリティ。"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass(slots=True)
class CodexConfig:
    command: str
    workdir: Path
    timeout: float = 120.0
    color: str = "never"
    json_output: bool = True


class CodexExecutionError(RuntimeError):
    """Codex 実行時のエラー。"""


class CodexClient:
    """Codex CLI を `codex exec` 経由で呼び出すクライアント。"""

    def __init__(self, config: CodexConfig):
        self._config = config

    async def run(self, prompt: str) -> str:
        """Codex CLI を一度呼び出し、最終のアシスタント応答文字列を返す。"""
        cmd: List[str] = [
            self._config.command,
            "exec",
            f"--color={self._config.color}",
            "--cd",
            str(self._config.workdir),
        ]
        if self._config.json_output:
            cmd.append("--json")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        assert process.stdin is not None
        stdin_payload = prompt.rstrip("\n") + "\n"
        process.stdin.write(stdin_payload.encode("utf-8"))
        await process.stdin.drain()
        process.stdin.close()

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=self._config.timeout
            )
        except asyncio.TimeoutError as exc:
            process.kill()
            raise CodexExecutionError("codex exec timed out") from exc

        stdout_text = stdout_bytes.decode("utf-8", errors="ignore")
        stderr_text = stderr_bytes.decode("utf-8", errors="ignore")

        messages = self._extract_messages(stdout_text)
        if not messages:
            # 何も取得できない場合は stderr を優先し、なければ生の stdout
            fallback = stderr_text.strip() or stdout_text.strip()
            if not fallback:
                raise CodexExecutionError("codex exec produced no output")
            return fallback

        response_text = "\n".join(messages)
        stderr_lines = [
            line
            for line in (stderr_text.splitlines() if stderr_text else [])
            if line.strip()
            and not line.strip().startswith("Reading prompt from stdin")
            and "afplay: command not found" not in line
        ]
        if stderr_lines:
            response_text += "\n[stderr]\n" + "\n".join(stderr_lines)

        return response_text

    def _extract_messages(self, stdout_text: str) -> list[str]:
        messages: list[str] = []
        for line in stdout_text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.endswith(": line 1: afplay: command not found"):
                # Codex CLI が macOS 専用サウンド再生を試みた際の警告。無視する。
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                messages.append(stripped)
                continue

            msg = payload.get("msg")
            if isinstance(msg, dict):
                msg_type = msg.get("type")
                if msg_type == "agent_message":
                    content = msg.get("message")
                    if content:
                        messages.append(content)
                elif msg_type == "error":
                    detail = msg.get("message") or "Codex error"
                    messages.append(f"[error] {detail}")
            elif payload.get("type") == "agent-turn-complete":
                content = payload.get("last-assistant-message")
                if content:
                    messages.append(content)
            elif any(key in payload for key in ("model", "provider", "workdir")):
                # 実行メタデータ行は応答に含めない。
                continue
            elif payload.get("prompt"):
                # 初期プロンプト情報はノイズなので無視
                continue
            else:
                messages.append(stripped)
        return messages


__all__ = ["CodexClient", "CodexConfig", "CodexExecutionError"]
