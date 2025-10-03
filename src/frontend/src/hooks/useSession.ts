import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SessionCreateResponse {
  session_id: string;
}

interface SessionCancelResponse {
  session_id: string;
  cancelled: boolean;
  message: string;
}

export type OutputRole = "user" | "assistant" | "status";

export interface OutputEntry {
  id: string;
  role: OutputRole;
  content: string;
  pending?: boolean;
}

type StreamStatus = "idle" | "connecting" | "open" | "error" | "unsupported";

interface SessionStreamPayload {
  id?: string;
  entry_id?: string;
  stream?: string;
  role?: OutputRole;
  text?: string;
  content?: string;
  chunk?: string;
  message?: string;
  pending?: boolean;
  final?: boolean;
  done?: boolean;
  append?: boolean;
  replace?: boolean;
}

const STREAM_PLACEHOLDER = "Codex が応答中…";

const parseStreamPayload = (raw: string): SessionStreamPayload => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as SessionStreamPayload;
    }
  } catch (error) {
    console.warn("failed to parse stream payload as JSON", error);
  }
  return { text: raw };
};

const mapStreamToRole = (stream?: string): OutputRole => {
  if (stream === "input") {
    return "user";
  }
  if (stream === "status") {
    return "status";
  }
  return "assistant";
};

const mergeStreamContent = (
  current: string,
  incoming: string,
  replace: boolean
) => {
  if (!incoming) {
    return current;
  }
  if (replace || !current || current === STREAM_PLACEHOLDER) {
    return incoming;
  }
  return `${current}${incoming}`;
};

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

const inferRoleFromContent = (content: string): OutputRole => {
  if (!content) {
    return "assistant";
  }
  if (
    content.startsWith("[timeout]") ||
    content.startsWith("[cancelled]") ||
    content.startsWith("[codex-error]") ||
    content.startsWith("[error]")
  ) {
    return "status";
  }
  return "assistant";
};

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [streamError, setStreamError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeEntryIdRef = useRef<string | null>(null);
  const counterRef = useRef(0);
  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

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

  const clearReconnectTimer = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disposeStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    clearReconnectTimer();
  }, [clearReconnectTimer]);

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

  useEffect(() => {
    activeEntryIdRef.current = activeEntryId;
  }, [activeEntryId]);

  const resetSession = useCallback(() => {
    disposeStream();
    reconnectAttemptsRef.current = 0;
    setStreamStatus("idle");
    setStreamError(null);
    applySessionId(null);
  }, [applySessionId, disposeStream]);

  const nextId = useCallback(() => {
    counterRef.current += 1;
    return `entry-${counterRef.current}`;
  }, []);

  const handleStreamMessage = useCallback(
    (payload: SessionStreamPayload, meta: { lastEventId?: string } = {}) => {
      const streamType = payload.stream;
      const role = payload.role ?? mapStreamToRole(streamType);
      const text =
        payload.text ??
        payload.content ??
        payload.chunk ??
        payload.message ??
        "";
      const entryIdFromPayload =
        payload.entry_id ?? payload.id ?? meta.lastEventId ?? undefined;
      const shouldAppend =
        payload.append ??
        (streamType === "output" || streamType === undefined);
      const isFinal = payload.final === true || payload.done === true;
      const hasText = text.length > 0;
      const hasPendingFlag = payload.pending !== undefined;

      if (!hasText && !hasPendingFlag) {
        if (isFinal && activeEntryIdRef.current) {
          setActiveEntryId(null);
          activeEntryIdRef.current = null;
        }
        return;
      }

      if (streamType === "input") {
        const entryId = entryIdFromPayload ?? nextId();
        updateOutput((previous) => {
          const exists = previous.some((entry) => entry.id === entryId);
          if (exists) {
            return previous;
          }
          return [
            ...previous,
            { id: entryId, role, content: text, pending: payload.pending },
          ];
        });
        return;
      }

      if (activeEntryIdRef.current) {
        const targetId = activeEntryIdRef.current;
        updateOutput((previous) =>
          previous.map((entry) => {
            if (entry.id !== targetId) {
              return entry;
            }
            const replaceExisting =
              payload.replace === true ||
              !shouldAppend ||
              entry.pending === true ||
              entry.content === STREAM_PLACEHOLDER ||
              !entry.content;
            const nextContent = hasText
              ? mergeStreamContent(entry.content, text, replaceExisting)
              : entry.content;
            return {
              ...entry,
              role,
              content: nextContent,
              pending:
                payload.pending ?? (hasText ? false : entry.pending ?? undefined),
            };
          })
        );
        if (isFinal) {
          setActiveEntryId(null);
          activeEntryIdRef.current = null;
        }
        return;
      }

      const entryId = entryIdFromPayload ?? nextId();
      updateOutput((previous) => {
        const index = previous.findIndex((entry) => entry.id === entryId);
        if (index >= 0) {
          const existing = previous[index];
          const replaceExisting =
            payload.replace === true || !shouldAppend || !existing.content;
          const nextContent = hasText
            ? mergeStreamContent(existing.content, text, replaceExisting)
            : existing.content;
          const nextEntry: OutputEntry = {
            ...existing,
            role,
            content: nextContent,
            pending: payload.pending ?? existing.pending,
          };
          return [
            ...previous.slice(0, index),
            nextEntry,
            ...previous.slice(index + 1),
          ];
        }
        return [
          ...previous,
          { id: entryId, role, content: text, pending: payload.pending },
        ];
      });

      if (isFinal) {
        setActiveEntryId(null);
        activeEntryIdRef.current = null;
      }
    },
    [nextId, setActiveEntryId, updateOutput]
  );

  const connectStream = useCallback(
    function connectStreamInner(
      targetSessionId: string,
      options?: { retry?: boolean }
    ) {
      if (typeof window === "undefined") {
        return;
      }
      if (!("EventSource" in window)) {
        setStreamStatus("unsupported");
        setStreamError(
          "このブラウザは Server-Sent Events をサポートしていません。"
        );
        return;
      }
      if (sessionIdRef.current !== targetSessionId) {
        return;
      }

      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
      clearReconnectTimer();

      setStreamStatus("connecting");
      if (!options?.retry) {
        reconnectAttemptsRef.current = 0;
      }

      const source = new EventSource(`${baseUrl}/${targetSessionId}/stream`);
      streamRef.current = source;

      source.onopen = () => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        setStreamStatus("open");
        setStreamError(null);
      };

      source.onmessage = (event) => {
        const payload = parseStreamPayload(event.data);
        handleStreamMessage(payload, {
          lastEventId: event.lastEventId || undefined,
        });
      };

      source.onerror = () => {
        if (sessionIdRef.current !== targetSessionId) {
          return;
        }
        setStreamStatus("error");
        setStreamError(
          "ログストリームとの接続が切断されました。再接続を試みます。"
        );
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
        clearReconnectTimer();
        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;
        const delay = Math.min(1000 * attempt, 10000);
        reconnectTimerRef.current = window.setTimeout(() => {
          connectStreamInner(targetSessionId, { retry: true });
        }, delay);
      };
    },
    [baseUrl, clearReconnectTimer, handleStreamMessage]
  );

  useEffect(() => {
    if (!sessionId) {
      disposeStream();
      reconnectAttemptsRef.current = 0;
      setStreamStatus("idle");
      setStreamError(null);
      return;
    }
    connectStream(sessionId);
    return () => {
      disposeStream();
    };
  }, [connectStream, disposeStream, sessionId]);

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
      setActiveEntryId(pendingEntryId);
      activeEntryIdRef.current = pendingEntryId;
      updateOutput((previous) => [
        ...previous,
        { id: userEntryId, role: "user", content: command },
        {
          id: pendingEntryId,
          role: "assistant",
          content: STREAM_PLACEHOLDER,
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
        const latest = (data.latest_output ?? "") as string;
        updateOutput((previous) =>
          previous.map((entry) =>
            entry.id === pendingEntryId
              ? {
                  ...entry,
                  role: inferRoleFromContent(latest),
                  content: latest || "(応答なし)",
                  pending: false,
                }
              : entry
          )
        );
        setActiveEntryId(null);
      } catch (error) {
        const isAbortError =
          error instanceof DOMException && error.name === "AbortError";
        const message =
          error instanceof Error ? error.message : "unexpected error";
        updateOutput((previous) =>
          previous.map((entry) =>
            entry.id === pendingEntryId
              ? {
                  ...entry,
                  role: "status",
                  content: isAbortError
                    ? "リクエストを中断しました"
                    : `エラー: ${message}`,
                  pending: false,
                }
              : entry
          )
        );
        setActiveEntryId(null);
        if (!isAbortError) {
          throw error;
        }
      }
    },
    [baseUrl, createSessionIfNeeded, nextId, resetSession, updateOutput]
  );

  const cancelCommand = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    const pendingEntryId = activeEntryIdRef.current;
    if (!currentSessionId || !pendingEntryId) {
      return false;
    }

    updateOutput((previous) =>
      previous.map((entry) =>
        entry.id === pendingEntryId
          ? {
              ...entry,
              role: "status",
              content: "停止要求を送信しています…",
              pending: true,
            }
          : entry
      )
    );

    try {
      const response = await fetch(`${baseUrl}/${currentSessionId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const reason =
          (detail && typeof detail.detail === "string" && detail.detail) ||
          `status ${response.status}`;
        updateOutput((previous) =>
          previous.map((entry) =>
            entry.id === pendingEntryId
              ? {
                  ...entry,
                  role: "status",
                  content: `停止要求に失敗しました: ${reason}`,
                  pending: false,
                }
              : entry
          )
        );
        setActiveEntryId(null);
        return false;
      }

      const data = (await response.json()) as SessionCancelResponse;
      if (!data.cancelled) {
        updateOutput((previous) =>
          previous.map((entry) =>
            entry.id === pendingEntryId
              ? {
                  ...entry,
                  role: "status",
                  content: data.message || "停止要求は受理されませんでした",
                  pending: false,
                }
              : entry
          )
        );
        setActiveEntryId(null);
        return false;
      }

      updateOutput((previous) =>
        previous.map((entry) =>
          entry.id === pendingEntryId
            ? {
                ...entry,
                role: "status",
                content: "停止要求を送信しました。応答を待っています…",
                pending: true,
              }
            : entry
        )
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected error";
      updateOutput((previous) =>
        previous.map((entry) =>
          entry.id === pendingEntryId
            ? {
                ...entry,
                role: "status",
                content: `停止要求に失敗しました: ${message}`,
                pending: false,
              }
            : entry
        )
      );
      setActiveEntryId(null);
      return false;
    }
  }, [baseUrl, updateOutput]);

  return {
    sessionId,
    output,
    sendCommand,
    createSessionIfNeeded,
    cancelCommand,
    isRunning: activeEntryId !== null,
    streamStatus,
    streamError,
  };
}
