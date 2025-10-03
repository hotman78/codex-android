import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./hooks/useSession";
function App() {
    const [command, setCommand] = useState("");
    const outputEndRef = useRef(null);
    const { output, sendCommand, sessionId, createSessionIfNeeded, cancelCommand, isRunning, streamStatus, streamError, } = useSession();
    const streamStatusLabelMap = {
        idle: "ストリーム停止中",
        connecting: "ストリーム接続中…",
        open: "ストリーム接続中",
        error: "ストリーム再接続待機中",
        unsupported: "ストリーム未対応",
    };
    const streamStatusLabel = streamStatusLabelMap[streamStatus] ?? "ストリーム状態不明";
    useEffect(() => {
        outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [output]);
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isRunning) {
            return;
        }
        const trimmed = command.trim();
        if (!trimmed)
            return;
        setCommand("");
        await createSessionIfNeeded();
        await sendCommand(trimmed);
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsx("header", { className: "app-header", children: _jsxs("div", { className: "container header-inner", children: [_jsxs("div", { className: "brand", children: [_jsx("h1", { children: "Codex Web Console" }), _jsx("p", { children: "\u30D6\u30E9\u30A6\u30B6\u304B\u3089 Codex CLI \u3092\u64CD\u4F5C\u3059\u308B\u7BA1\u7406\u753B\u9762" })] }), _jsxs("nav", { className: "app-nav", "aria-label": "\u30E1\u30A4\u30F3\u30CA\u30D3\u30B2\u30FC\u30B7\u30E7\u30F3", children: [_jsx("button", { className: "nav-item is-active", type: "button", "aria-current": "page", children: "\u30B3\u30F3\u30BD\u30FC\u30EB" }), _jsx("button", { className: "nav-item", type: "button", disabled: true, children: "AGENTS" }), _jsx("button", { className: "nav-item", type: "button", disabled: true, children: "MCP \u8A2D\u5B9A" })] }), _jsxs("div", { className: "session-status", "aria-live": "polite", children: [_jsx("span", { className: "session-label", children: "\u73FE\u5728\u306E\u30BB\u30C3\u30B7\u30E7\u30F3" }), _jsx("code", { className: "session-id", children: sessionId ?? "未接続" }), _jsx("span", { className: `stream-status stream-${streamStatus}`, role: "status", children: streamStatusLabel }), streamError ? (_jsx("span", { className: "stream-error", role: "alert", children: streamError })) : null] })] }) }), _jsxs("main", { className: "app-main container", children: [_jsxs("section", { className: "output-section", "aria-label": "\u51FA\u529B\u30ED\u30B0", children: [_jsx("h2", { className: "section-title", children: "\u30ED\u30B0" }), _jsxs("div", { className: "output", role: "log", "aria-live": "polite", children: [output.map(({ id, content, role, pending }) => (_jsx("pre", { className: `log-line log-${role}${pending ? " log-pending" : ""}`, children: content }, id))), _jsx("div", { ref: outputEndRef })] })] }), _jsxs("section", { className: "input-section", "aria-label": "\u5165\u529B\u30D5\u30A9\u30FC\u30E0", children: [_jsx("h2", { className: "section-title", children: "\u30B3\u30DE\u30F3\u30C9\u9001\u4FE1" }), _jsxs("form", { onSubmit: handleSubmit, className: "input-form", children: [_jsx("textarea", { value: command, onChange: (event) => setCommand(event.target.value), onKeyDown: (event) => {
                                            if (event.key === "Enter" &&
                                                (event.ctrlKey || event.metaKey) &&
                                                !event.shiftKey) {
                                                event.preventDefault();
                                                event.currentTarget.form?.requestSubmit();
                                            }
                                        }, placeholder: "\u30B3\u30DE\u30F3\u30C9\u3092\u5165\u529B", rows: 3, "aria-disabled": isRunning }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { type: "button", className: "button-secondary", onClick: () => {
                                                    void cancelCommand();
                                                }, disabled: !isRunning, children: "\u505C\u6B62" }), _jsx("button", { type: "submit", disabled: isRunning, children: "\u9001\u4FE1" })] })] })] })] })] }));
}
export default App;
