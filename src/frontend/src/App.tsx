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
    if (!command.trim()) return;

    await createSessionIfNeeded();
    await sendCommand(command);
    setCommand("");
  };

  return (
    <div className="container">
      <header>
        <h1>Codex Web Console</h1>
        <p>Session ID: {sessionId ?? "未接続"}</p>
      </header>

      <section className="output" aria-live="polite">
        {output.map(({ id, content, role, pending }) => (
          <pre key={id} className={`log-line log-${role}${pending ? " log-pending" : ""}`}>
            {content}
          </pre>
        ))}
        <div ref={outputEndRef} />
      </section>

      <form onSubmit={handleSubmit} className="input-form">
        <textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="コマンドを入力"
          rows={3}
        />
        <button type="submit">送信</button>
      </form>
    </div>
  );
}

export default App;
