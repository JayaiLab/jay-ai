import { AssistantMessageEventStream } from "../event-stream";
import { AssistantMessage, TextBlock, ToolUseBlock } from "../types/messages";
import { CanonicalRequest, LLMProvider, ModelConfig } from "../types/model";

// NEVER convert to top-level imports — breaks browser/Vite builds (web-ui)
let _os: typeof import("node:os") | null = null;
if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
    import("node:os").then((m) => { _os = m; });
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH = "https://api.openai.com/auth" as const;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const WEBSOCKET_IDLE_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================
/** Responses API tool format */
interface ResponsesTool {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict: null;
}

/** Responses API input item */
type ResponsesInputItem =
    | { type: "message"; role: "user" | "assistant"; content: ResponsesContent[] }
    | { type: "function_call"; id: string; call_id: string; name: string; arguments: string }
    | { type: "function_call_output"; call_id: string; output: string };

type ResponsesContent =
    | { type: "input_text"; text: string }
    | { type: "output_text"; text: string };

interface RequestBody {
    model: string;
    store: boolean;
    stream: boolean;
    instructions?: string;
    input: ResponsesInputItem[];
    tools?: ResponsesTool[];
    tool_choice: "auto";
    parallel_tool_calls: boolean;
    reasoning?: { effort?: string; summary?: string };
    include: string[];
}

interface CachedWebSocketConnection {
    socket: WebSocketLike;
    inUse: boolean;
    idleTimer: ReturnType<typeof setTimeout> | null;
    closed: boolean;
}

// ============================================================================
// Provider
// ============================================================================

export class OpenAICodexProvider implements LLMProvider {
    constructor(private config: ModelConfig) { }

    stream(request: CanonicalRequest): AssistantMessageEventStream {
        const eventStream = new AssistantMessageEventStream();

        (async () => {
            const output: AssistantMessage = { role: "assistant", content: [] };

            try {
                const token = this.config.authToken;
                if (!token) {
                    throw new Error("OpenAI Codex requires an OAuth token (authToken)");
                }

                const accountId = extractAccountId(token);
                const body = this.buildRequestBody(request);
                const bodyJson = JSON.stringify(body);

                // Default to websocket since it's more efficient for tool-call chains
                const transport = this.config.transport ?? "websocket";

                if (transport === "websocket") {
                    await processWebSocketStream(
                        resolveWebSocketUrl(this.config),
                        body,
                        buildWebSocketHeaders(accountId, token),
                        output,
                        eventStream,
                        () => { },
                        this.config.sessionId,
                    );
                    eventStream.setFinalOutput(output);
                    eventStream.close();
                    return;
                }

                const response = await fetchWithRetry(
                    resolveSSEUrl(this.config),
                    buildSSEHeaders(accountId, token),
                    bodyJson,
                );

                if (!response.body) {
                    throw new Error("No response body");
                }

                eventStream.push({ type: "message_start", snapshot: output });
                await processSSEStream(response, output, eventStream);
                eventStream.push({ type: "message_end", output, snapshot: output });
                eventStream.setFinalOutput(output);
                eventStream.close();
            } catch (error) {
                eventStream.abort(error);
            }
        })();

        return eventStream;
    }

    private buildRequestBody(request: CanonicalRequest): RequestBody {
        const input = convertMessages(request.messages);
        const body: RequestBody = {
            model: this.config.model,
            store: false,
            stream: true,
            instructions: this.config.system,
            input,
            tool_choice: "auto",
            parallel_tool_calls: true,
            include: ["reasoning.encrypted_content"],
        };

        if (request.tools && request.tools.length > 0) {
            body.tools = request.tools.map(t => ({
                type: "function",
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
                strict: null,
            }));
        }

        if (this.config.thinking?.effort) {
            body.reasoning = {
                effort: this.config.thinking.effort,
                summary: "auto",
            };
        }

        return body;
    }
}

// ============================================================================
// Message Conversion
// ============================================================================

function convertMessages(messages: CanonicalRequest["messages"]): ResponsesInputItem[] {
    const items: ResponsesInputItem[] = [];

    for (const msg of messages) {
        if (typeof msg.content === "string") {
            const contentType = msg.role === "assistant" ? "output_text" : "input_text";
            items.push({
                type: "message",
                role: msg.role,
                content: [{ type: contentType, text: msg.content } as ResponsesContent],
            });
            continue;
        }

        const textParts: ResponsesContent[] = [];
        const toolUses: ToolUseBlock[] = [];
        const toolResults: Array<{ tool_use_id: string; content: string }> = [];

        for (const block of msg.content) {
            if (block.type === "text") {
                const contentType = msg.role === "assistant" ? "output_text" : "input_text";
                textParts.push({ type: contentType, text: block.text } as ResponsesContent);
            } else if (block.type === "tool_use") {
                toolUses.push(block);
            } else if (block.type === "tool_result") {
                const text = typeof block.content === "string"
                    ? block.content
                    : block.content.filter(b => b.type === "text").map(b => (b as TextBlock).text).join("\n");
                toolResults.push({ tool_use_id: block.tool_use_id, content: text });
            }
            // skip thinking blocks — not supported
        }

        if (textParts.length > 0) {
            items.push({ type: "message", role: msg.role, content: textParts });
        }

        for (const tu of toolUses) {
            items.push({
                type: "function_call",
                id: tu.id,
                call_id: tu.id,
                name: tu.name,
                arguments: JSON.stringify(tu.input),
            });
        }

        for (const tr of toolResults) {
            items.push({
                type: "function_call_output",
                call_id: tr.tool_use_id,
                output: tr.content,
            });
        }
    }

    return items;
}

// ============================================================================
// SSE
// ============================================================================

async function fetchWithRetry(url: string, headers: Headers, body: string): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body,
            });

            if (response.ok) return response;

            const errorText = await response.text();
            if (attempt < MAX_RETRIES && isRetryable(response.status, errorText)) {
                await sleep(BASE_DELAY_MS * 2 ** attempt);
                continue;
            }
            throw new Error(parseErrorMessage(response.status, errorText));
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < MAX_RETRIES && !lastError.message.includes("usage limit")) {
                await sleep(BASE_DELAY_MS * 2 ** attempt);
                continue;
            }
            throw lastError;
        }
    }

    throw lastError ?? new Error("Failed after retries");
}

async function processSSEStream(
    response: Response,
    output: AssistantMessage,
    stream: AssistantMessageEventStream,
): Promise<void> {
    for await (const event of parseSSE(response)) {
        processResponseEvent(event, output, stream);
    }
}

async function* parseSSE(response: Response): AsyncGenerator<Record<string, unknown>> {
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx = buffer.indexOf("\n\n");
            while (idx !== -1) {
                const chunk = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);

                const dataLines = chunk
                    .split("\n")
                    .filter(l => l.startsWith("data:"))
                    .map(l => l.slice(5).trim());

                if (dataLines.length > 0) {
                    const data = dataLines.join("\n").trim();
                    if (data && data !== "[DONE]") {
                        try {
                            const parsed = JSON.parse(data);
                            yield parsed;
                        } catch { }
                    }
                }
                idx = buffer.indexOf("\n\n");
            }
        }
    } finally {
        try { await reader.cancel(); } catch { }
        try { reader.releaseLock(); } catch { }
    }
}

// ============================================================================
// WebSocket
// ============================================================================
// We intentionally do not implement WebSocket reconnection here.
// WebSocket is used to improve efficiency for tool-call chains so we do not
// need to pay the TLS handshake cost again for each follow-up request.
// But we generally do not need to persist a WebSocket connection long-term,
// so if it drops, the current request fails instead of trying to reconnect.

type WebSocketEventType = "open" | "message" | "error" | "close";
type WebSocketListener = (event: unknown) => void;

interface WebSocketLike {
    close(code?: number, reason?: string): void;
    send(data: string): void;
    addEventListener(type: WebSocketEventType, listener: WebSocketListener): void;
    removeEventListener(type: WebSocketEventType, listener: WebSocketListener): void;
}

type WebSocketConstructor = new (
    url: string,
    protocols?: string | string[] | { headers?: Record<string, string> },
) => WebSocketLike;

const cachedWebSocketConnections = new Map<string, CachedWebSocketConnection>();

function getWebSocketConstructor(): WebSocketConstructor | null {
    const ctor = (globalThis as { WebSocket?: unknown }).WebSocket;
    return typeof ctor === "function" ? ctor as unknown as WebSocketConstructor : null;
}

async function connectWebSocket(url: string, headers: Headers): Promise<WebSocketLike> {
    const WebSocketCtor = getWebSocketConstructor();
    if (!WebSocketCtor) {
        throw new Error("WebSocket transport is not available in this runtime");
    }

    const wsHeaders: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
        wsHeaders[key] = value;
    }

    return new Promise<WebSocketLike>((resolve, reject) => {
        let settled = false;
        let socket: WebSocketLike;

        try {
            socket = new WebSocketCtor(url, { headers: wsHeaders });
        } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
        }

        const cleanup = () => {
            socket.removeEventListener("open", onOpen);
            socket.removeEventListener("error", onError);
            socket.removeEventListener("close", onClose);
        };
        const onOpen: WebSocketListener = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(socket);
        };
        const onError: WebSocketListener = (event) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(extractWebSocketError(event));
        };
        const onClose: WebSocketListener = (event) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(extractWebSocketCloseError(event));
        };

        socket.addEventListener("open", onOpen);
        socket.addEventListener("error", onError);
        socket.addEventListener("close", onClose);
    });
}

function clearCachedWebSocketIdleTimer(entry: CachedWebSocketConnection): void {
    if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
    }
}

function removeCachedWebSocketConnection(sessionId: string, closeSocket: boolean): void {
    const entry = cachedWebSocketConnections.get(sessionId);
    if (!entry) return;
    cachedWebSocketConnections.delete(sessionId);
    clearCachedWebSocketIdleTimer(entry);
    entry.closed = true;
    entry.inUse = false;
    if (closeSocket) {
        try { entry.socket.close(1000, "idle"); } catch { }
    }
}

function scheduleCachedWebSocketIdleExpiry(sessionId: string, entry: CachedWebSocketConnection): void {
    clearCachedWebSocketIdleTimer(entry);
    entry.idleTimer = setTimeout(() => {
        const current = cachedWebSocketConnections.get(sessionId);
        if (!current || current !== entry || current.inUse) return;
        removeCachedWebSocketConnection(sessionId, true);
    }, WEBSOCKET_IDLE_TTL_MS);
}

function attachCachedWebSocketLifecycle(sessionId: string, entry: CachedWebSocketConnection): void {
    const onError: WebSocketListener = () => {
        removeCachedWebSocketConnection(sessionId, false);
    };
    const onClose: WebSocketListener = () => {
        removeCachedWebSocketConnection(sessionId, false);
    };
    entry.socket.addEventListener("error", onError);
    entry.socket.addEventListener("close", onClose);
}

async function getOrCreateCachedWebSocket(
    sessionId: string,
    url: string,
    headers: Headers,
): Promise<CachedWebSocketConnection> {
    const existing = cachedWebSocketConnections.get(sessionId);
    if (existing) {
        if (existing.closed) {
            cachedWebSocketConnections.delete(sessionId);
        } else if (existing.inUse) {
            throw new Error(`WebSocket session ${sessionId} is already in use`);
        } else {
            clearCachedWebSocketIdleTimer(existing);
            existing.inUse = true;
            return existing;
        }
    }

    const socket = await connectWebSocket(url, headers);
    const entry: CachedWebSocketConnection = {
        socket,
        inUse: true,
        idleTimer: null,
        closed: false,
    };
    attachCachedWebSocketLifecycle(sessionId, entry);
    cachedWebSocketConnections.set(sessionId, entry);
    return entry;
}

function extractWebSocketError(event: unknown): Error {
    if (event && typeof event === "object" && "message" in event) {
        const message = (event as { message?: unknown }).message;
        if (typeof message === "string" && message.length > 0) return new Error(message);
    }
    return new Error("WebSocket error");
}

function extractWebSocketCloseError(event: unknown): Error {
    if (event && typeof event === "object") {
        const code = "code" in event ? (event as { code?: unknown }).code : undefined;
        const reason = "reason" in event ? (event as { reason?: unknown }).reason : undefined;
        const codeText = typeof code === "number" ? ` ${code}` : "";
        const reasonText = typeof reason === "string" && reason.length > 0 ? ` ${reason}` : "";
        return new Error(`WebSocket closed${codeText}${reasonText}`.trim());
    }
    return new Error("WebSocket closed");
}

async function decodeWebSocketData(data: unknown): Promise<string | null> {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView;
        return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    if (data && typeof data === "object" && "arrayBuffer" in data) {
        const blobLike = data as { arrayBuffer: () => Promise<ArrayBuffer> };
        return new TextDecoder().decode(new Uint8Array(await blobLike.arrayBuffer()));
    }
    return null;
}

async function* parseWebSocket(socket: WebSocketLike): AsyncGenerator<Record<string, unknown>> {
    const queue: Record<string, unknown>[] = [];
    let pending: (() => void) | null = null;
    let done = false;
    let failed: Error | null = null;
    let sawCompletion = false;

    const wake = () => { if (pending) { const r = pending; pending = null; r(); } };

    const onMessage: WebSocketListener = (event) => {
        void (async () => {
            if (!event || typeof event !== "object" || !("data" in event)) return;
            const text = await decodeWebSocketData((event as { data?: unknown }).data);
            if (!text) return;
            try {
                const parsed = JSON.parse(text) as Record<string, unknown>;
                const type = typeof parsed.type === "string" ? parsed.type : "";
                if (type === "response.completed" || type === "response.done" || type === "response.incomplete") {
                    sawCompletion = true;
                    done = true;
                }
                queue.push(parsed);
                wake();
            } catch { }
        })();
    };

    const onError: WebSocketListener = (event) => {
        failed = extractWebSocketError(event);
        done = true;
        wake();
    };

    const onClose: WebSocketListener = (event) => {
        if (sawCompletion) { done = true; wake(); return; }
        if (!failed) failed = extractWebSocketCloseError(event);
        done = true;
        wake();
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);

    try {
        while (true) {
            if (queue.length > 0) { yield queue.shift()!; continue; }
            if (done) break;
            await new Promise<void>((resolve) => { pending = resolve; });
        }
        if (failed) throw failed;
        if (!sawCompletion) throw new Error("WebSocket stream closed before response.completed");
    } finally {
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
    }
}

async function processWebSocketStream(
    url: string,
    body: RequestBody,
    headers: Headers,
    output: AssistantMessage,
    stream: AssistantMessageEventStream,
    onStart: () => void,
    sessionId?: string,
): Promise<void> {
    const cachedEntry = sessionId
        ? await getOrCreateCachedWebSocket(sessionId, url, headers)
        : null;
    const socket = cachedEntry?.socket ?? await connectWebSocket(url, headers);

    try {
        socket.send(JSON.stringify({ type: "response.create", ...body }));
        onStart();
        stream.push({ type: "message_start", snapshot: output });

        for await (const event of parseWebSocket(socket)) {
            processResponseEvent(event, output, stream);
        }

        stream.push({ type: "message_end", output, snapshot: output });
    } catch (error) {
        if (sessionId) {
            removeCachedWebSocketConnection(sessionId, true);
        }
        throw error;
    } finally {
        if (cachedEntry) {
            cachedEntry.inUse = false;
            if (!cachedEntry.closed) {
                scheduleCachedWebSocketIdleExpiry(sessionId!, cachedEntry);
            }
        } else {
            try { socket.close(1000, "done"); } catch { }
        }
    }
}

// ============================================================================
// Responses API Event Processing (shared by SSE and WebSocket)
// ============================================================================

function processResponseEvent(
    event: Record<string, unknown>,
    output: AssistantMessage,
    stream: AssistantMessageEventStream,
): void {
    const type = typeof event.type === "string" ? event.type : "";

    if (type === "error") {
        const message = (event as { message?: string }).message || "";
        const code = (event as { code?: string }).code || "";
        throw new Error(`Codex error: ${message || code || JSON.stringify(event)}`);
    }

    if (type === "response.failed") {
        const msg = (event as { response?: { error?: { message?: string } } }).response?.error?.message;
        throw new Error(msg || "Codex response failed");
    }

    // Text output
    if (type === "response.output_text.delta") {
        const delta = (event as { delta?: string }).delta ?? "";
        // Find existing text block or create one
        let textIdx = output.content.findIndex(b => b.type === "text");
        if (textIdx === -1) {
            textIdx = output.content.length;
            output.content.push({ type: "text", text: "" });
            stream.push({ type: "text_start", index: textIdx, snapshot: output });
        }
        (output.content[textIdx] as TextBlock).text += delta;
        stream.push({ type: "text_delta", index: textIdx, text: delta, snapshot: output });
    }

    if (type === "response.output_text.done") {
        const textIdx = output.content.findIndex(b => b.type === "text");
        if (textIdx !== -1) {
            stream.push({ type: "text_end", index: textIdx, snapshot: output });
        }
    }

    // Function/tool calls — starts with output_item.added, not function_call_arguments.start
    if (type === "response.output_item.added") {
        const item = (event as { item?: { type?: string; id?: string; name?: string; call_id?: string } }).item;
        if (item?.type === "function_call") {
            const name = item.name ?? "";
            const id = item.id ?? "";
            const idx = output.content.length;
            output.content.push({
                type: "tool_use",
                id,
                name,
                input: {},
                _args_json: "",
            } as ToolUseBlock & { _args_json: string });
            stream.push({ type: "tool_use_start", index: idx, id, name, snapshot: output });
        }
    }

    if (type === "response.function_call_arguments.delta") {
        const delta = (event as { delta?: string }).delta ?? "";
        const idx = findLastToolUseIndex(output);
        if (idx !== -1) {
            (output.content[idx] as ToolUseBlock & { _args_json?: string })._args_json =
                ((output.content[idx] as ToolUseBlock & { _args_json?: string })._args_json ?? "") + delta;
            stream.push({ type: "tool_input_json_delta", index: idx, partial_json: delta, snapshot: output });
        }
    }

    if (type === "response.function_call_arguments.done") {
        const idx = findLastToolUseIndex(output);
        if (idx !== -1) {
            const block = output.content[idx] as ToolUseBlock & { _args_json?: string };
            try { block.input = JSON.parse(block._args_json || "{}"); } catch { block.input = {}; }
            delete block._args_json;
        }
    }

    // Response completion
    if (type === "response.completed" || type === "response.done") {
        const resp = (event as { response?: { status?: string } }).response;
        if (resp?.status === "incomplete") {
            output.stop_reason = "max_tokens";
        } else {
            const hasToolUse = output.content.some(b => b.type === "tool_use");
            output.stop_reason = hasToolUse ? "tool_use" : "end_turn";
        }
    }
}

function findLastToolUseIndex(output: AssistantMessage): number {
    for (let i = output.content.length - 1; i >= 0; i--) {
        if (output.content[i].type === "tool_use") return i;
    }
    return -1;
}

// ============================================================================
// Auth & Headers
// ============================================================================

function extractAccountId(token: string): string {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token");
        const payload = JSON.parse(atob(parts[1]));
        const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
        if (!accountId) throw new Error("No account ID in token");
        return accountId;
    } catch {
        throw new Error("Failed to extract accountId from token");
    }
}

function buildBaseHeaders(accountId: string, token: string): Headers {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("chatgpt-account-id", accountId);
    headers.set("originator", "pi");
    const userAgent = _os ? `jayai (${_os.platform()} ${_os.release()}; ${_os.arch()})` : "jayai (browser)";
    headers.set("User-Agent", userAgent);
    return headers;
}

function buildSSEHeaders(accountId: string, token: string): Headers {
    const headers = buildBaseHeaders(accountId, token);
    headers.set("OpenAI-Beta", "responses=experimental");
    headers.set("accept", "text/event-stream");
    headers.set("content-type", "application/json");
    return headers;
}

function buildWebSocketHeaders(accountId: string, token: string): Headers {
    const headers = buildBaseHeaders(accountId, token);
    headers.set("OpenAI-Beta", "responses_websockets=2026-02-06");
    headers.set("x-client-request-id", createRequestId());
    return headers;
}

function createRequestId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `codex_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// URL Resolution
// ============================================================================

function resolveSSEUrl(config: ModelConfig): string {
    const base = (DEFAULT_BASE_URL).replace(/\/+$/, "");
    if (base.endsWith("/codex/responses")) return base;
    if (base.endsWith("/codex")) return `${base}/responses`;
    return `${base}/codex/responses`;
}

function resolveWebSocketUrl(config: ModelConfig): string {
    const url = new URL(resolveSSEUrl(config));
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    return url.toString();
}

// ============================================================================
// Helpers
// ============================================================================

function isRetryable(status: number, errorText: string): boolean {
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
    return /rate.?limit|overloaded|service.?unavailable/i.test(errorText);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseErrorMessage(status: number, errorText: string): string {
    try {
        const parsed = JSON.parse(errorText) as {
            error?: { code?: string; message?: string; plan_type?: string; resets_at?: number };
        };
        const err = parsed?.error;
        if (err) {
            if (/usage_limit_reached|rate_limit_exceeded/i.test(err.code || "") || status === 429) {
                const plan = err.plan_type ? ` (${err.plan_type.toLowerCase()} plan)` : "";
                const mins = err.resets_at
                    ? Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
                    : undefined;
                const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
                return `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
            }
            return err.message || errorText;
        }
    } catch { }
    return `${status}: ${errorText}`;
}
