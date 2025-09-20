import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SessionCreateResponse {
  session_id: string;
}

export type OutputRole = "user" | "assistant" | "status";

export interface OutputEntry {
  id: string;
  role: OutputRole;
  content: string;
  pending?: boolean;
}

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const counterRef = useRef(0);

  const baseUrl = useMemo(() => "/api/sessions", []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const nextId = useCallback(() => {
    counterRef.current += 1;
    return `entry-${counterRef.current}`;
  }, []);

  const createSessionIfNeeded = useCallback(async () => {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }
    const response = await fetch(baseUrl, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("failed to create session");
    }
    const data = (await response.json()) as SessionCreateResponse;
    sessionIdRef.current = data.session_id;
    setSessionId(data.session_id);
    return data.session_id;
  }, [baseUrl]);

  const sendCommand = useCallback(
    async (command: string) => {
      const ensuredSessionId = await createSessionIfNeeded();

      if (!ensuredSessionId) {
        throw new Error("session is not ready");
      }

      const userEntryId = nextId();
      const pendingEntryId = nextId();
      setOutput((prev) => [
        ...prev,
        { id: userEntryId, role: "user", content: command },
        { id: pendingEntryId, role: "assistant", content: "Codex が応答中…", pending: true },
      ]);

      try {
        const response = await fetch(`${baseUrl}/${ensuredSessionId}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: command }),
        });
        if (!response.ok) {
          throw new Error("failed to send command");
        }
        const data = await response.json();
        const latest = data.latest_output ?? "";
        setOutput((prev) =>
          prev.map((entry) =>
            entry.id === pendingEntryId
              ? { ...entry, content: latest || "(応答なし)", pending: false }
              : entry
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unexpected error";
        setOutput((prev) =>
          prev.map((entry) =>
            entry.id === pendingEntryId
              ? {
                  ...entry,
                  role: "status",
                  content: `エラー: ${message}`,
                  pending: false,
                }
              : entry
          )
        );
        throw error;
      }
    },
    [baseUrl, createSessionIfNeeded, nextId]
  );

  return {
    sessionId,
    output,
    sendCommand,
    createSessionIfNeeded,
  };
}
