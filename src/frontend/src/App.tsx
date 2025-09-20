import { FormEvent, useEffect, useRef, useState } from "react";

import { useSession } from "./hooks/useSession";

function App() {
  const [command, setCommand] = useState("");
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const { output, sendCommand, sessionId, createSessionIfNeeded } = useSession();

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
            />
            <button type="submit">送信</button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
