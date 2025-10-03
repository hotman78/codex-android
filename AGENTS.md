# AGENTS

## 2025-10-03
- Codex: mcp-wait を uvx --from 実行対応開始 (2025-10-03)
- Codex: task run-discord-bot を uvx --from 実行対応開始 (2025-10-03)


## 2025-10-02
- Codex: Discord ボット チャンネルコンテキスト対応開始 (2025-10-02)
- Codex: Discord ボット チャンネルコンテキスト対応完了 (2025-10-02)
- Codex: Discord Bot 実装タスク着手 (2025-10-02)
- Codex: Discord Bot 初期実装と README 更新 (2025-10-02)
- Codex: Discord ボット環境変数手順整備対応開始 (2025-10-02)
- Codex: Discord ボット環境変数手順整備完了 (2025-10-02)
- Codex: Discord ボット返信トリガー対応開始 (2025-10-02)
- Codex: Discord ボット返信トリガー対応完了 (2025-10-02)
- Codex: Discord ボットメンショントリガー拡張 (2025-10-02)
- Codex: Discord ボット自動チャンネルトリガー追加 (2025-10-02)

## 2025-09-29
- Codex: TODO.md に mcp-wait の動作確認項目を追記 (2025-09-29)
- mcp-wait の filesystem-mcp 対応作業を開始しました。
- mcp-wait の filesystem-mcp 対応整備を実施しました。
- mcp-wait 実行用ディレクトリをリポジトリ内に移し、/home/hotman/mcp/mcp-wait シンボリックリンクを再構成しました。
- mcp-wait 実体を ~/mcp/mcp-wait 配下にコピーし、ランタイムを `.runtime` に集約しました。
- mcp-wait 起動不具合を確認し、config.toml の tilde 展開問題を解消しました。
- ユーザーから挨拶「こんにちは～」を受領しました。
- mcp-wait を Codex から起動しようとしたが、~/mcp 配下への書き込みが制限され Permission denied となりました。

- Codex: mcp-wait の wait_seconds(5秒) をクライアント経由で実行し、応答を確認 (2025-09-29)

- Codex: mcp-wait の wait_seconds(10秒) をクライアント経由で実行し、timeout を調整して応答を確認 (2025-09-29)

- Codex: run_wait_server.sh の runtime_base を呼び出し元ディレクトリ配下 (.mcp-wait-runtime) に変更 (2025-09-29)
- Codex: フロントエンドの SSE ログストリーム購読ロジックを実装しリアルタイム表示を有効化 (2025-09-29)
