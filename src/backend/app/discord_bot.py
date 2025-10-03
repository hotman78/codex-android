"""Discord ボットから Codex CLI を利用するエントリーポイント。"""
from __future__ import annotations

import asyncio
import io
import logging
from collections.abc import Sequence
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from ..core.config import settings
from ..services.codex_client import (
    CodexClient,
    CodexConfig,
    CodexExecutionError,
    CodexTimeoutError,
)


LOGGER = logging.getLogger(__name__)
MESSAGE_LIMIT = 1900  # Discord の 2000 文字制限の手前で分割
TRIGGER_PREFIX = "!codex"


class CodexDiscordBot(commands.Bot):
    """Codex CLI と連携する Discord ボット。"""

    def __init__(
        self,
        *,
        codex_client: CodexClient,
        max_concurrency: int,
        guild_ids: Sequence[int],
        ephemeral: bool,
        auto_channel_ids: Sequence[int],
        context_limit: int,
    ) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix=commands.when_mentioned, intents=intents)
        self._codex_client = codex_client
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._ephemeral = ephemeral
        self._guild_ids = [discord.Object(id=guild_id) for guild_id in guild_ids]
        self._auto_channel_ids = {int(channel_id) for channel_id in auto_channel_ids}
        self._context_limit = max(0, int(context_limit))

    async def setup_hook(self) -> None:  # noqa: D401
        """Slash Command を対象ギルドに同期する。"""
        if not self._guild_ids:
            await self.tree.sync()
            LOGGER.info("synced global application commands")
            return

        for guild in self._guild_ids:
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            LOGGER.info("synced application commands to guild %s", guild.id)

    async def cog_load(self) -> None:  # pragma: no cover - discord.py lifecycle hook stub
        return None

    async def cog_unload(self) -> None:  # pragma: no cover - discord.py lifecycle hook stub
        return None

    async def on_message(self, message: discord.Message) -> None:
        if message.author == self.user:
            return

        prompt = self._extract_prompt_from_message(message)
        triggered = prompt is not None

        reference = message.reference
        if triggered and prompt == "" and reference and reference.message_id:
            prompt = await self._resolve_reference_prompt(message)
            if prompt is None:
                await self.process_commands(message)
                return

        if triggered and prompt:
            context_entries = await self._collect_context(message)
            final_prompt = self._compose_prompt(
                prompt=prompt,
                context_entries=context_entries,
                channel=message.channel,
            )
            async with message.channel.typing():
                result, error = await self._execute_prompt(
                    final_prompt,
                    log_context=f"message:{message.id} user:{message.author.id}",
                )

            if error:
                await message.reply(error, mention_author=False)
            else:
                await self._send_message_response(message, result)

        elif triggered and not prompt:
            await message.reply("プロンプトを入力してください。", mention_author=False)

        await self.process_commands(message)

    def _extract_prompt_from_message(self, message: discord.Message) -> str | None:
        content = (message.content or "").strip()
        if not content:
            return None

        channel_id = getattr(message.channel, "id", None)
        if channel_id is not None and channel_id in self._auto_channel_ids:
            sanitized = self._strip_bot_mentions(content).strip()
            if sanitized.startswith(TRIGGER_PREFIX):
                sanitized = sanitized[len(TRIGGER_PREFIX) :].strip()
            return sanitized

        if content.startswith(TRIGGER_PREFIX):
            return content[len(TRIGGER_PREFIX) :].strip()

        if self.user and any(user.id == self.user.id for user in message.mentions):
            return self._strip_bot_mentions(content).strip()

        return None

    def _strip_bot_mentions(self, content: str) -> str:
        if not self.user:
            return content
        variants = {
            self.user.mention,
            f"<@{self.user.id}>",
            f"<@!{self.user.id}>",
        }
        sanitized = content
        for token in variants:
            sanitized = sanitized.replace(token, "")
        return sanitized

    async def _collect_context(self, message: discord.Message) -> list[tuple[str, str]]:
        if self._context_limit <= 0:
            return []

        context: list[tuple[str, str]] = []
        try:
            async for history_msg in message.channel.history(
                limit=self._context_limit, before=message, oldest_first=True
            ):
                if history_msg.author == self.user:
                    continue
                content = (history_msg.content or "").strip()
                if not content:
                    continue
                author = history_msg.author.display_name or history_msg.author.name
                context.append((author, content))
        except Exception:  # noqa: BLE001
            LOGGER.warning("failed to fetch channel history", exc_info=True)
            return []
        return context

    def _compose_prompt(
        self,
        *,
        prompt: str,
        context_entries: list[tuple[str, str]],
        channel: discord.abc.MessageableChannel | None,
    ) -> str:
        if not context_entries:
            return prompt

        channel_name = getattr(channel, "name", None) or getattr(channel, "id", "channel")
        lines = [f"# Conversation context from {channel_name}"]
        for author, content in context_entries:
            lines.append(f"- {author}: {content}")
        lines.append("")
        lines.append("# User request")
        lines.append(prompt)
        return "\n".join(lines)

    async def _resolve_reference_prompt(self, message: discord.Message) -> str | None:
        reference = message.reference
        if reference is None or reference.message_id is None:
            return None

        referenced = reference.resolved
        if isinstance(referenced, discord.DeletedReferencedMessage):
            await message.reply(
                "返信先のメッセージが削除されているため実行できません。",
                mention_author=False,
            )
            return None

        if referenced is None:
            try:
                referenced = await message.channel.fetch_message(reference.message_id)
            except discord.NotFound:
                await message.reply("返信先のメッセージが見つかりませんでした。", mention_author=False)
                return None
            except discord.HTTPException:
                await message.reply("返信先のメッセージ取得に失敗しました。", mention_author=False)
                return None

        prompt = (referenced.content or "").strip()
        if not prompt:
            await message.reply("返信先のメッセージにテキストがありません。", mention_author=False)
            return None
        return prompt

    async def handle_prompt(self, interaction: discord.Interaction, prompt: str) -> None:
        await interaction.response.defer(thinking=True, ephemeral=self._ephemeral)
        result, error = await self._execute_prompt(
            prompt,
            log_context=f"interaction:{interaction.id} user:{interaction.user.id}",
        )
        if error:
            await interaction.followup.send(error, ephemeral=self._ephemeral)
            return
        await self._send_interaction_response(interaction, result)

    async def _execute_prompt(self, prompt: str, *, log_context: str) -> tuple[Optional[str], Optional[str]]:
        async with self._semaphore:
            LOGGER.info("received prompt (%s)", log_context)
            try:
                result = await self._codex_client.run(prompt)
            except CodexTimeoutError as exc:
                LOGGER.warning("codex timeout: %s (%s)", exc, log_context)
                return None, f"Codex が {exc.timeout:.1f} 秒以内に応答しませんでした。"
            except CodexExecutionError as exc:
                LOGGER.exception("codex execution failed (%s)", log_context)
                return None, f"Codex 実行中にエラーが発生しました: {exc}"
        return result, None

    async def _send_interaction_response(self, interaction: discord.Interaction, result: str) -> None:
        content = result.strip()
        if not content:
            await interaction.followup.send("Codex から応答がありませんでした。", ephemeral=self._ephemeral)
            return

        if len(content) <= MESSAGE_LIMIT:
            await interaction.followup.send(content, ephemeral=self._ephemeral)
            return

        buffer = io.BytesIO(content.encode("utf-8"))
        file = discord.File(buffer, filename="codex-output.txt")
        await interaction.followup.send(
            "出力が長いためファイルとして送信します。",
            file=file,
            ephemeral=self._ephemeral,
        )

    async def _send_message_response(self, message: discord.Message, result: str) -> None:
        content = result.strip()
        if not content:
            await message.reply("Codex から応答がありませんでした。", mention_author=False)
            return

        if len(content) <= MESSAGE_LIMIT:
            await message.reply(content, mention_author=False)
            return

        buffer = io.BytesIO(content.encode("utf-8"))
        file = discord.File(buffer, filename="codex-output.txt")
        await message.reply(
            "出力が長いためファイルとして送信します。",
            file=file,
            mention_author=False,
        )


def _create_codex_client() -> CodexClient:
    config = CodexConfig(
        command=settings.codex_command,
        workdir=settings.workdir,
        timeout=settings.codex_timeout,
    )
    return CodexClient(config)


def build_bot() -> CodexDiscordBot:
    """設定に基づいてボットを生成する。"""
    bot = CodexDiscordBot(
        codex_client=_create_codex_client(),
        max_concurrency=settings.discord_max_concurrency,
        guild_ids=settings.discord_guild_ids,
        ephemeral=settings.discord_response_ephemeral,
        auto_channel_ids=settings.discord_auto_channel_ids,
        context_limit=settings.discord_context_message_limit,
    )

    @bot.tree.command(name="codex", description="Codex CLI にプロンプトを送信します。")
    @app_commands.describe(prompt="Codex に渡すプロンプト")
    async def codex_command(interaction: discord.Interaction, prompt: str) -> None:
        await bot.handle_prompt(interaction, prompt)

    return bot


def require_token(token: Optional[str]) -> str:
    if not token:
        raise RuntimeError(
            "Discord ボットのトークンが設定されていません。"
            "環境変数 CODEX_WEB_DISCORD_BOT_TOKEN を設定してください。"
        )
    return token


async def run_bot_async() -> None:
    token = require_token(settings.discord_bot_token)
    bot = build_bot()
    async with bot:
        await bot.start(token)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot_async())


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
