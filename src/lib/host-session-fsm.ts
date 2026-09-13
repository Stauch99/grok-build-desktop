export type HostSessionState =
  | "idle"
  | "connecting"
  | "ready"
  | "streaming"
  | "awaiting_permission"
  | "disconnected";

export type HostSessionEvent =
  | "start_connect"
  | "handshake_ok"
  | "connect_failed"
  | "begin_stream"
  | "await_permission"
  | "permission_resolved"
  | "end_stream"
  | "crash"
  | "soft_disconnect"
  | "reattach_ok";

/** Pure Host session FSM. Illegal events leave the state unchanged. */
export function reduceHostSession(state: HostSessionState, event: HostSessionEvent): HostSessionState {
  switch (event) {
    case "start_connect":
      return state === "idle" || state === "disconnected" ? "connecting" : state;
    case "handshake_ok":
      return state === "connecting" ? "ready" : state;
    case "connect_failed":
      return state === "connecting" ? "disconnected" : state;
    case "begin_stream":
      return state === "ready" ? "streaming" : state;
    case "await_permission":
      return state === "streaming" ? "awaiting_permission" : state;
    case "permission_resolved":
      return state === "awaiting_permission" ? "streaming" : state;
    case "end_stream":
      return state === "streaming" || state === "awaiting_permission" ? "ready" : state;
    case "crash":
      return state === "idle" ? "idle" : "disconnected";
    case "soft_disconnect":
      return state === "idle" || state === "disconnected" ? state : "disconnected";
    case "reattach_ok":
      return state === "disconnected" ? "ready" : state;
    default:
      return state;
  }
}

export type HostSessionFlags = {
  connecting: boolean;
  ready: boolean;
  busy: boolean;
  pendingPermission: boolean;
  disconnected: boolean;
};

/** Project UI flags onto the Host FSM. Connecting wins over a stale disconnect. */
export function projectHostSession(f: HostSessionFlags): HostSessionState {
  if (f.connecting && !f.ready) return "connecting";
  if (f.disconnected) return "disconnected";
  if (f.pendingPermission) return "awaiting_permission";
  if (f.busy) return "streaming";
  if (f.ready) return "ready";
  return "idle";
}
