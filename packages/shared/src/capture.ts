// The capture contract: what the extension Recorder emits and the API ingests.
// The capture contract spec: docs/phase-1-copilot.md §6. `file` refs are relative
// keys within a session bundle (resolved to R2 object keys server-side).

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EventTarget {
  role?: string;
  accessibleName?: string;
  text?: string;
  tag?: string;
  attributes?: Record<string, string>;
  cssPath?: string;
  xpath?: string;
  bbox?: Bbox;
  framePath?: string;
}

export interface Route {
  url: string;
  path: string;
  hash: string;
  title: string;
}

export interface FileRef {
  file: string;
}

export interface PostAction {
  screenshot?: FileRef;
  domSnapshot?: FileRef;
  route?: Route;
  settleReason?: string; // mutation_quiet | network_idle | timeout
}

export type CaptureEventType =
  | 'click'
  | 'input'
  | 'submit'
  | 'nav'
  | 'scroll'
  | 'hover'
  | 'keydown'
  | 'marker';

export interface CapturedEvent {
  id: string;
  t: number; // ms from session start
  type: CaptureEventType | string;
  target: EventTarget;
  value?: string;
  route: Route;
  domSnapshot?: FileRef;
  screenshot?: FileRef;
  postAction?: PostAction;
}

export interface Marker {
  t: number;
  label?: string;
}

export interface AppMeta {
  baseUrl: string;
  userAgent: string;
  viewport: { w: number; h: number };
  devicePixelRatio: number;
}

export interface SessionManifest {
  id: string;
  createdAt: string;
  app: AppMeta;
  audio?: { file: string; durationMs?: number };
  video?: null;
  markers: Marker[];
  events: CapturedEvent[];
}
