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
  | { cmd: 'start'; backendUrl: string }
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
export type PortMsg = PortEventMsg | PortPostActionMsg | PortAppMetaMsg;
