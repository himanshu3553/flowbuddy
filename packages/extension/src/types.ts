// Capture types shared across extension contexts. Mirrors backend/src/types.ts.

export interface Bbox { x: number; y: number; w: number; h: number; }

export interface EventTarget {
  role?: string;
  accessibleName?: string;
  text?: string;
  tag?: string;
  attributes?: Record<string, string>;
  cssPath?: string;
  xpath?: string;
  bbox?: Bbox;
  framePath?: string; // R8 — the sub-frame URL an event came from (top-frame events omit this)
}

export interface Route { url: string; path: string; hash: string; title: string; }
export interface FileRef { file: string; }

export interface PostAction {
  screenshot?: FileRef;
  domSnapshot?: FileRef;
  route?: Route;
  settleReason?: string;
}

export interface CapturedEvent {
  id: string;
  t: number;
  type: string;
  target: EventTarget;
  value?: string;
  route: Route;
  domSnapshot?: FileRef;
  screenshot?: FileRef;
  postAction?: PostAction;
}

export interface Marker { t: number; label?: string; }

export interface AppMeta {
  baseUrl: string;
  userAgent: string;
  viewport: { w: number; h: number };
  devicePixelRatio: number;
}

// ---- messages ----

export type PopupCmd =
  | { cmd: 'start'; backendUrl: string; token: string }
  | { cmd: 'stop' }
  | { cmd: 'marker' }
  | { cmd: 'getState' };

export interface PortEventMsg { kind: 'event'; event: CapturedEvent; domHtml: string; }
export interface PortPostActionMsg {
  kind: 'postAction';
  eventId: string;
  domHtml: string;
  route: Route;
  settleReason: string;
}
export interface PortAppMetaMsg { kind: 'appMeta'; meta: AppMeta; }
// R4 — a heartbeat with no payload: resets the MV3 idle timer so the service worker isn't evicted
// mid-recording during quiet narration. The background receives it and does nothing else.
export interface PortKeepAliveMsg { kind: 'keepalive'; }
export type PortMsg = PortEventMsg | PortPostActionMsg | PortAppMetaMsg | PortKeepAliveMsg;
