# Codex Web ラッパー 実装方針

## 1. 目的
- SSH 接続に依存しない Codex CLI 操作用の Web コンソールを提供する。
- Cloudflare Tunnel を利用して安全に外部公開し、少数ユーザー向けにアクセス制御する。
- Android 向けプロジェクトの編集・ビルド支援を遠隔で実現する。

## 2. システム構成概要
- **WSL2 内バックエンド**: FastAPI (ASGI) + `codex` CLI サブプロセス制御。
- **フロントエンド**: 単一ページ Web アプリ (React/Vite あるいは HTMX)。入力フォームとログストリーム表示。
- **ストリーミング**: Server-Sent Events (SSE) または WebSocket による標準出力の逐次転送。
- **トンネル**: Cloudflare Tunnel (`cloudflared`) が 127.0.0.1:5174 を外部公開。Cloudflare Access で認証。
- **保存領域**: セッションログは SQLite/JSONL で任意保存。機密性に応じて暗号化も検討。

```
Browser ──HTTPS── Cloudflare ──cloudflared── FastAPI ──Codex CLI── 作業ツリー
```

## 3. バックエンド設計
- `uv init codex-web` で Python プロジェクト作成。パッケージ管理は `uv`、実行は `uvx` を徹底。
- 依存追加: `uv add fastapi uvicorn[standard] pydantic[dotenv] websockets orjson`。
- API レイヤ:
  - `POST /sessions` で新規セッション作成。`uuid4` を返し、以降の通信キーに利用。
  - `POST /sessions/{id}/input` でコマンドを送信。キューに積み、ワーカーで `codex` プロセスに書き込み。
  - `GET /sessions/{id}/stream` (SSE/WS) で標準出力・標準エラーをリアルタイム配信。
  - `DELETE /sessions/{id}` でプロセス終了。
- プロセス管理: `asyncio.create_subprocess_exec("codex", ...)`。
  - 作業ディレクトリは `/home/hotman/github.com/hotman78/codex-android`。
  - タイムアウト／失敗時の再起動ポリシーを定義。
- ログ記録: 各行に `timestamp, session_id, stream(stdout/stderr), message` を付与して保存。
- 認可: Cloudflare Access から渡る JWT を検証 (バックエンドで `CF_Authorization` ヘッダーを確認)。

## 4. セッション管理 / 制限
- セッション上限を設定 (例: 同時 3 セッション) し、超過時は 429 応答。
- 操作可能時間を設定 (例: 最終アクティビティから 30 分で自動終了)。
- 実行可能コマンド制限: `codex` のみを許可し、任意シェル実行を防ぐためのラッパーを導入。
- ファイルアクセス: Codex CLI のワークスペース書き込み権限のみ。バックエンドは最小権限ユーザーで起動。

## 5. フロントエンド方針
- Vite + React or HTMX + Tailwind のいずれかで短期間構築。
- 機能:
  - セッション生成/再接続 UI
  - 入力フォーム (マルチライン対応)
  - ログ表示 (バッファリング + 検索/コピー)
  - セッション終了ボタン
- SSE 実装時は `EventSource`、WS は `WebSocket` API を利用。バックプレッシャー対策として行数上限と自動スクロール制御。

## 6. Cloudflare Tunnel 設定
- `cloudflared tunnel create codex-web`。
- `~/.cloudflared/config.yml` 例:
  ```yaml
  tunnel: codex-web
  credentials-file: /home/hotman/.cloudflared/codex-web.json
  ingress:
    - hostname: codex.example.com
      service: http://localhost:5174
      originRequest:
        http2: true
    - service: http_status:404
  ```
- Cloudflare DNS で `codex.example.com` をトンネルに割り当て (`CNAME` → `uuid.cfargotunnel.com`) し、Cloudflare Access で `codex.example.com` 向けにメールワンタイムパス or SSO を設定。
- systemd / NSSM 等で `cloudflared service install` を用い常駐化。

## 7. 開発フロー
1. `uv run uvicorn app.main:app --reload` でローカル開発。
2. `uv add pytest pytest-asyncio httpx` で API テスト。Codex プロセスは `subprocess` モックまたは `codex --dry-run` モードで検証。
3. フロントエンドは `npm create vite@latest` などで隣接ディレクトリに配置し、`npm run dev` + プロキシ設定で連携。
4. 共同開発を想定し、`README` にセットアップ手順・環境変数 (`CF_TUNNEL_TOKEN`, `CODEX_WORKDIR`) を記載。

## 8. セキュリティ / 運用
- Cloudflare Access 以外にバックエンドでも Bearer Token を必須化し二段階で認証。
- HTTPS 経由のみ許可 (`uvicorn --proxy-headers --forwarded-allow-ips '*'`)。
- Rate Limiting を実装 (FastAPI Middleware + Redis or in-memory)。
- ログはローテーションし、機密情報が出力されないようサニタイズ。
- 緊急時用の SSH 連絡経路を維持し、Web コンソール障害時のリカバリー手順を文書化。

## 9. デプロイ / 継続運用
- バックエンドとフロントエンドは同一 WSL インスタンス内に配置。`systemd --user` で `uvicorn` と `cloudflared` を常駐化。
- 更新は `git pull` → `uv sync` → `npm install` → `npm run build` → `uv run uvicorn --reload` リスタート。
- バージョン管理: `main` ブランチで運用、`feature/...` ブランチで改修。
- 定期的に Codex CLI / Cloudflare ツールの更新を確認し、互換性試験を行う。

## 10. 今後の拡張候補
- マルチユーザー対応 (セッション履歴、同時編集制御)。
- Slack / Teams 通知でビルド完了・エラーを通知。
- `adb` コマンドの Web UI への追加 (実機テスト操作をブラウザから実行)。
- Terraform or Ansible による一括セットアップ自動化。
- Observability: OpenTelemetry + Grafana Loki で統合ログ監視。

