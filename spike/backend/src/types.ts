// Shared types for the spike pipeline. Mirrors the capture contract in
// docs/SPIKE.md §12 and docs/phase-1-spec.md §6 (spike subset).

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
  framePath?: string;
}

export interface Route {
  url: string;
  path: string;
  hash: string;
  title: string;
}

export interface FileRef { file: string; }

export interface PostAction {
  screenshot?: FileRef;
  domSnapshot?: FileRef;
  route?: Route;
  settleReason?: string; // mutation_quiet | network_idle | timeout
}

export interface CapturedEvent {
  id: string;
  t: number; // ms from session start
  type: string; // click | input | submit | nav | scroll | keydown | marker
  target: EventTarget;
  value?: string; // masked input value
  route: Route;
  domSnapshot?: FileRef;
  screenshot?: FileRef;
  postAction?: PostAction;
}

export interface Marker { t: number; label?: string; }

export interface SessionManifest {
  id: string;
  createdAt: string;
  app: {
    baseUrl: string;
    userAgent: string;
    viewport: { w: number; h: number };
    devicePixelRatio: number;
  };
  audio?: { file: string; durationMs?: number };
  video?: null;
  markers: Marker[];
  events: CapturedEvent[];
}

// ---- pipeline intermediates ----

export interface TranscriptSegment { start: number; end: number; text: string; } // ms
export interface Transcript { text: string; segments: TranscriptSegment[]; }

export interface Segment { title: string; eventIds: string[]; }
export interface Segmentation { segments: Segment[]; }

export interface Step {
  instruction: string;
  rationale?: string;
  screenshotRef?: string; // eventId whose screenshot illustrates this step
  selector?: string;
  route?: string;
  expectedOutcome?: string;
  uncertain?: boolean;
}

export interface Article {
  title: string;
  intent?: string;
  tags?: string[];
  routes?: string[];
  preconditions?: string[];
  steps: Step[];
  sourceSessionId?: string;
}

export type StageName =
  | 'received'
  | 'transcribe'
  | 'segment'
  | 'synthesize'
  | 'render'
  | 'done'
  | 'error';

export interface RunStatus {
  id: string;
  stage: StageName;
  startedAt: string;
  updatedAt: string;
  error?: string;
  articleCount?: number;
  renderUrl?: string;
}
