# codex-android

vibe coding で作ってもらった codex の webサーバー
細かい所はまだ
科学の力ってスゲー

## Discord ボット連携

Codex CLI の実行結果を Discord から呼び出せる slash command を追加しました。`/codex` コマンドにプロンプトを渡すと、Codex CLI の応答をチャネルへ投稿します。加えて、任意のメッセージに対するリプライでボットを起動する方法も利用できます。

### 必要条件
- Python 3.11 (uv が自動で .venv を作成します)
- Discord ボットトークン（[Discord Developer Portal](https://discord.com/developers/applications) で取得）
- Codex CLI へのアクセス権
- Discord Developer Portal で「MESSAGE CONTENT INTENT」を有効化（返信トリガーを使用する場合は必須）

### セットアップ手順
1. 依存関係の同期
   ```bash
   uv sync
   ```
2. `.env` を準備
   ```bash
   cp .env.example .env
   ```
   - `CODEX_WEB_DISCORD_BOT_TOKEN`: Discord ボットトークン（必須）
   - `CODEX_WEB_DISCORD_GUILD_IDS`: Slash Command を即時同期したいギルド ID の JSON 文字列（例: `[123456789012345678]`。未設定ならグローバルコマンドで、反映に最大 1 時間程度）
   - `CODEX_WEB_DISCORD_MAX_CONCURRENCY`: 同時に処理する Codex 実行数（既定値 1）
   - `CODEX_WEB_DISCORD_RESPONSE_EPHEMERAL`: 応答をエフェメラルで返したい場合は `true`
   - `CODEX_WEB_DISCORD_AUTO_CHANNEL_IDS`: メッセージを投稿するだけで Codex を実行したいチャンネル ID の JSON 文字列
   - `CODEX_WEB_DISCORD_CONTEXT_MESSAGE_LIMIT`: コンテキストとして参照する直近メッセージ数（既定値 5）
   - `CODEX_WEB_CODEX_TIMEOUT` など既存の Codex 設定も `.env` で上書き可能です
3. ボットを起動
   ```bash
   uvx --from gh:hotman78/codex-android run-discord-bot
   ```
   カレントディレクトリに `.env` があれば自動的に読み込まれます。Taskfile を利用する場合は `task run-discord-bot` でも同じコマンドを実行できます。

### 使い方
- **自動トリガーチャンネル:** `.env` の `CODEX_WEB_DISCORD_AUTO_CHANNEL_IDS` に登録したチャンネルでは、メッセージを投稿するだけで Codex が実行されます。`@codex` や `!codex` は不要です。
- **メンション:** ボットを `@codex` でメンションしつつ同じメッセージにプロンプトを書けば、その本文をそのまま Codex に送信します。
- **返信トリガー:** プロンプトを通常メッセージとして投稿し、そのメッセージに対して `@codex` か `!codex` を含む返信を送ると、返信元メッセージの本文をプロンプトとして実行します。
- **Slash Command:** `/codex` コマンドを呼び出し、プロンプトを入力すると Codex の結果が表示されます。
  応答が 2000 文字を超える場合はいずれの方法でも自動でテキストファイルとして添付されます。

トリガー方法に関わらず、直近のメッセージ（`.env` の `CODEX_WEB_DISCORD_CONTEXT_MESSAGE_LIMIT` 件まで）はコンテキストとして自動投入されます。

### トラブルシューティング
- Slash Command が表示されない場合は `CODEX_WEB_DISCORD_GUILD_IDS` に対象ギルド ID を設定して再起動すると即時同期されます。
- Codex CLI の応答がタイムアウトした場合はタイムアウトメッセージを返します。必要に応じて `CODEX_WEB_CODEX_TIMEOUT` を調整してください。
- `.env` の内容が反映されない場合はコマンドを `.env` と同じディレクトリで実行し、必要な `CODEX_WEB_...` 変数が設定されているか確認してください。`pydantic-settings` が `.env` を自動で読み込みます。
- 返信トリガーで "Missing Access" が発生する場合は、ボットが返信対象のチャンネルでメッセージ送信権限を持っているか、再招待時に `bot` と `applications.commands` スコープが含まれているかを確認してください。
