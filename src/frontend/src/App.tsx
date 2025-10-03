import { FormEvent, useEffect, useRef, useState } from "react";

import { useSession } from "./hooks/useSession";

function App() {
  const [command, setCommand] = useState("");
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const {
    output,
    sendCommand,
    sessionId,
    createSessionIfNeeded,
    cancelCommand,
    isRunning,
    streamStatus,
    streamError,
  } = useSession();

  const streamStatusLabelMap = {
    idle: "ストリーム停止中",
    connecting: "ストリーム接続中…",
    open: "ストリーム接続中",
    error: "ストリーム再接続待機中",
    unsupported: "ストリーム未対応",
  } as const;

  const streamStatusLabel =
    streamStatusLabelMap[
      streamStatus as keyof typeof streamStatusLabelMap
    ] ?? "ストリーム状態不明";

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRunning) {
      return;
    }
    const trimmed = command.trim();
    if (!trimmed) return;

    setCommand("");
    await createSessionIfNeeded();
    await sendCommand(trimmed);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container header-inner">
          <div className="brand">
            <h1>Codex Web Console</h1>
            <p>ブラウザから Codex CLI を操作する管理画面</p>
          </div>
          <nav className="app-nav" aria-label="メインナビゲーション">
            <button className="nav-item is-active" type="button" aria-current="page">
              コンソール
            </button>
            <button className="nav-item" type="button" disabled>
              AGENTS
            </button>
            <button className="nav-item" type="button" disabled>
              MCP 設定
            </button>
          </nav>
          <div className="session-status" aria-live="polite">
            <span className="session-label">現在のセッション</span>
            <code className="session-id">{sessionId ?? "未接続"}</code>
            <span className={`stream-status stream-${streamStatus}`} role="status">
              {streamStatusLabel}
            </span>
            {streamError ? (
              <span className="stream-error" role="alert">
                {streamError}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-main container">
        <section className="output-section" aria-label="出力ログ">
          <h2 className="section-title">ログ</h2>
          <div className="output" role="log" aria-live="polite">
            {output.map(({ id, content, role, pending }) => (
              <pre key={id} className={`log-line log-${role}${pending ? " log-pending" : ""}`}>
                {content}
              </pre>
            ))}
            <div ref={outputEndRef} />
          </div>
        </section>

        <section className="input-section" aria-label="入力フォーム">
          <h2 className="section-title">コマンド送信</h2>
          <form onSubmit={handleSubmit} className="input-form">
            <textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.ctrlKey || event.metaKey) &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="コマンドを入力"
              rows={3}
              aria-disabled={isRunning}
            />
            <div className="form-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  void cancelCommand();
                }}
                disabled={!isRunning}
              >
                停止
              </button>
              <button type="submit" disabled={isRunning}>
                送信
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
