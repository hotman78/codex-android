# TODO

## MCP
- [ ] mcp-wait を uvx --from で GitHub から実行可能にする（2025-10-03 Codex 着手）
- [ ] mcp-wait の動作確認（2025-09-29 Codex 実施予定）
- [ ] inspector-mcp の動作検証
- [x] mcp-wait の5秒待機検証（2025-09-29 Codex で実施、uv 権限問題をエスカレーションで解決）
- [x] mcp-wait の10秒待機検証（2025-09-29 Codex で実施、uvx timeout を25秒に設定）
- [x] mcp-wait の filesystem-mcp 対応整備


## バックエンド
- [ ] task run-discord-bot を uvx --from で GitHub 実行対応（2025-10-03 Codex 着手）
- [ ] `InMemorySessionStore` の `codex_runner_stub` を置き換え、Codex CLI プロセスを `asyncio.create_subprocess_exec` で起動して入出力をストリーミングする
- [ ] セッションごとの SSE または WebSocket ストリーム (`GET /sessions/{id}/stream`) を実装し、クライアントへリアルタイム配信できるようにする
- [ ] セッション上限・アイドルタイムアウト・キュークリアなど運用制限を `InMemorySessionStore` に実装する
- [ ] 標準出力ログを SQLite もしくは JSONL へ永続化し、timestamp / stream 種別を記録する
- [ ] Cloudflare Access の JWT 検証および追加 Bearer Token の認可ミドルウェアを導入する
- [ ] レートリミットとリクエスト監査ログを追加する
- [ ] FastAPI 用テスト（`pytest-asyncio` + `httpx`）を整備し、主要エンドポイントの回帰テストを作成する

## フロントエンド
- [ ] セッション再接続・強制終了 UI、出力の検索 / コピー機能を追加する
- [ ] エラーステートやロード中表示など UX 改善を行う
- [ ] API ベース URL や認証ヘッダー設定を `.env`/環境変数経由で行えるよう調整する

## インフラ / 運用
- [ ] `cloudflared` トンネル設定ファイルと起動手順 (`systemd --user` など) をリポジトリへテンプレート化して共有する
- [ ] Cloudflare Access の JWT 検証および追加 Bearer Token の認可ミドルウェアを導入する
- [ ] README にセットアップ手順（`uv sync`、`uv run uvicorn ...`、フロントエンドの `npm install` など）を追記する
- [ ] 運用監視（OpenTelemetry や Grafana Loki など）の検討事項を ISSUE/ドキュメントとして整理する

## 将来検討
- [ ] マルチユーザー履歴管理や Slack/Teams 通知など、IMPLEMENTATION_PLAN.md に記載の拡張候補をチケット化する
