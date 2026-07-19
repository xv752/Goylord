import { ref, onUnmounted } from "vue";

type WsStatus = "connecting" | "connected" | "disconnected" | "error";
type MessageHandler = (data: Record<string, unknown> | Uint8Array) => void;

export function useWebSocket() {
  const status = ref<WsStatus>("disconnected");
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let msgHandler: MessageHandler | null = null;
  let url = "";
  let destroyed = false;

  function connect(wsUrl: string, onMessage: MessageHandler) {
    url = wsUrl;
    msgHandler = onMessage;
    destroyed = false;
    doConnect();
  }

  function doConnect() {
    if (destroyed) return;
    status.value = "connecting";
    try {
      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => { status.value = "connected"; };
      ws.onmessage = (ev) => {
        if (!msgHandler) return;
        if (typeof ev.data === "string") {
          try { msgHandler(JSON.parse(ev.data)); } catch { /* ignore */ }
        } else if (ev.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(ev.data);
          if (bytes.length > 7 && bytes[0] === 0x46 && bytes[1] === 0x52 && bytes[2] === 0x4D && bytes[3] === 0x01) {
            msgHandler({ type: "__frame__", data: bytes } as unknown as Record<string, unknown>);
          } else {
            try {
              const text = new TextDecoder().decode(bytes);
              msgHandler(JSON.parse(text));
            } catch {
              msgHandler({ type: "__binary__", data: bytes } as unknown as Record<string, unknown>);
            }
          }
        }
      };
      ws.onclose = () => {
        status.value = "disconnected";
        if (!destroyed) reconnectTimer = setTimeout(doConnect, 3000);
      };
      ws.onerror = () => { status.value = "error"; ws?.close(); };
    } catch {
      status.value = "error";
      if (!destroyed) reconnectTimer = setTimeout(doConnect, 3000);
    }
  }

  function sendJson(data: Record<string, unknown>) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  function sendRaw(data: string | ArrayBuffer | Uint8Array) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(data);
  }

  function disconnect() {
    destroyed = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) { ws.close(); ws = null; }
    status.value = "disconnected";
  }

  onUnmounted(() => { disconnect(); });

  return { status, connect, sendJson, sendRaw, disconnect };
}
