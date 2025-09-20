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

const STORAGE_KEY = "codex-web-session-id";
const STORAGE_OUTPUT_PREFIX = "codex-web-session-output:";

const isOutputRole = (value: unknown): value is OutputRole =>
  value === "user" || value === "assistant" || value === "status";

const randomEntryId = () => `restored-${Math.random().toString(36).slice(2)}`;

const sanitizeStoredOutput = (raw: string | null): OutputEntry[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object"
      )
      .map((entry) => {
        const id = typeof entry.id === "string" ? entry.id : randomEntryId();
        const role = isOutputRole(entry.role) ? entry.role : "assistant";
        const content = typeof entry.content === "string" ? entry.content : "";
        const pending =
          typeof entry.pending === "boolean" ? entry.pending : undefined;
        return { id, role, content, pending } as OutputEntry;
      });
  } catch (error) {
    console.error("failed to parse stored output", error);
    return [];
  }
};

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const counterRef = useRef(0);

  const baseUrl = useMemo(() => "/api/sessions", []);

  const persistOutput = useCallback((entries: OutputEntry[]) => {
    if (typeof window === "undefined") {
      return;
    }
    const currentId = sessionIdRef.current;
    if (!currentId) {
      return;
    }
    const storageKey = `${STORAGE_OUTPUT_PREFIX}${currentId}`;
    if (entries.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch (error) {
      console.error("failed to persist session output", error);
    }
  }, []);

  const updateOutput = useCallback(
    (updater: (previous: OutputEntry[]) => OutputEntry[]) => {
      setOutput((previous) => {
        const nextEntries = updater(previous);
        persistOutput(nextEntries);
        return nextEntries;
      });
    },
    [persistOutput]
  );

  const applySessionId = useCallback(
    (value: string | null) => {
      const previousId = sessionIdRef.current;
      sessionIdRef.current = value;
      setSessionId(value);

      if (typeof window === "undefined") {
        return;
      }

      if (value) {
        window.localStorage.setItem(STORAGE_KEY, value);
        const restored = sanitizeStoredOutput(
          window.localStorage.getItem(`${STORAGE_OUTPUT_PREFIX}${value}`)
        );
        updateOutput(() => restored);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        if (previousId) {
          window.localStorage.removeItem(
            `${STORAGE_OUTPUT_PREFIX}${previousId}`
          );
        }
        updateOutput(() => []);
      }
    },
    [updateOutput]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedId = window.localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      applySessionId(storedId);
    }
  }, [applySessionId]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const resetSession = useCallback(() => {
    applySessionId(null);
  }, [applySessionId]);

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
    applySessionId(data.session_id);
    return data.session_id;
  }, [applySessionId, baseUrl]);

  const sendCommand = useCallback(
    async (command: string) => {
      let ensuredSessionId = await createSessionIfNeeded();

      if (!ensuredSessionId) {
        throw new Error("session is not ready");
      }

      const userEntryId = nextId();
      const pendingEntryId = nextId();
      updateOutput((previous) => [
        ...previous,
        { id: userEntryId, role: "user", content: command },
        {
          id: pendingEntryId,
          role: "assistant",
          content: "Codex が応答中…",
          pending: true,
        },
      ]);

      try {
        const requestPayload = JSON.stringify({ text: command });
        const performRequest = async (targetSessionId: string) =>
          fetch(`${baseUrl}/${targetSessionId}/input`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestPayload,
          });

        let response = await performRequest(ensuredSessionId);

        if (response.status === 404) {
          updateOutput((previous) =>
            previous.map((entry) =>
              entry.id === pendingEntryId
                ? {
                    ...entry,
                    role: "status",
                    content: "セッションが切断されたため再接続しています…",
                    pending: true,
                  }
                : entry
            )
          );
          resetSession();
          ensuredSessionId = await createSessionIfNeeded();
          response = await performRequest(ensuredSessionId);
        }

        if (!response.ok) {
          throw new Error(`failed to send command: ${response.status}`);
        }

        const data = await response.json();
        const latest = data.latest_output ?? "";
        updateOutput((previous) =>
          previous.map((entry) =>
            entry.id === pendingEntryId
              ? {
                  ...entry,
                  role: "assistant",
                  content: latest || "(応答なし)",
                  pending: false,
                }
              : entry
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected error";
        updateOutput((previous) =>
          previous.map((entry) =>
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
    [baseUrl, createSessionIfNeeded, nextId, resetSession, updateOutput]
  );

  return {
    sessionId,
    output,
    sendCommand,
    createSessionIfNeeded,
  };
}
