import OpenAI from 'openai';
import type { CapturedEvent, Marker } from '@sync/shared';

export interface Segment { title: string; eventIds: string[]; }

export function eventLabel(ev: CapturedEvent): string {
  const t = ev.target || {};
  const name = t.accessibleName || t.text || t.attributes?.placeholder || t.tag || ev.type;
  const clipped = String(name).replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${ev.type} "${clipped}" @ ${ev.route?.path ?? ''}`;
}

const SYSTEM = `You split a single screen-recording session into distinct help-article workflows.
The user recorded themselves doing several tasks in one sitting (e.g. "reset a password", then "upgrade a plan").
Group the ordered events into coherent workflows. Respect user-placed markers as strong boundaries.
Every event id must appear in exactly one segment, preserving order. Give each segment a concise, action-oriented title.`;

const schema = {
  name: 'segmentation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            eventIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'eventIds'],
        },
      },
    },
    required: ['segments'],
  },
} as const;

export async function segment(
  openai: OpenAI,
  model: string,
  events: CapturedEvent[],
  markers: Marker[],
  narration: Map<string, string>,
): Promise<Segment[]> {
  if (events.length === 0) return [];

  const timeline = events
    .map((ev) => {
      const n = narration.get(ev.id);
      return `- id=${ev.id} | ${eventLabel(ev)}${n ? ` | said: "${n.slice(0, 160)}"` : ''}`;
    })
    .join('\n');

  const markerLines = markers.length
    ? markers.map((m) => `- marker @ ${m.t}ms${m.label ? `: ${m.label}` : ''}`).join('\n')
    : '(none)';

  const user = `Events (in order):\n${timeline}\n\nUser markers:\n${markerLines}\n\nReturn the segmentation.`;

  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: schema as any },
  });

  const content = res.choices[0]?.message?.content ?? '{"segments":[]}';
  let parsed: { segments?: Segment[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { segments: [] };
  }

  const known = new Set(events.map((e) => e.id));
  let segments = (parsed.segments || [])
    .map((s) => ({
      title: s.title || 'Untitled workflow',
      eventIds: (s.eventIds || []).filter((id) => known.has(id)),
    }))
    .filter((s) => s.eventIds.length > 0);

  if (segments.length === 0) {
    segments = [{ title: 'Recorded workflow', eventIds: events.map((e) => e.id) }];
  }
  return segments;
}
