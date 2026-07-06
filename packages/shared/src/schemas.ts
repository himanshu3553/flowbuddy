// Runtime validation (zod) for the capture contract. Used by the API to validate
// uploaded session manifests before persisting/enqueuing.

import { z } from 'zod';

export const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const routeSchema = z.object({
  url: z.string(),
  path: z.string(),
  hash: z.string(),
  title: z.string(),
});

export const fileRefSchema = z.object({ file: z.string() });

export const locatorSchema = z.object({
  strategy: z.enum(['testid', 'id', 'aria', 'name', 'placeholder', 'href', 'text', 'css', 'xpath']),
  value: z.string(),
  unique: z.boolean().optional(),
});

export const eventTargetSchema = z.object({
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  text: z.string().optional(),
  tag: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  cssPath: z.string().optional(),
  xpath: z.string().optional(),
  locators: z.array(locatorSchema).optional(),
  bbox: bboxSchema.optional(),
  framePath: z.string().optional(),
});

export const postActionSchema = z.object({
  screenshot: fileRefSchema.optional(),
  domSnapshot: fileRefSchema.optional(),
  route: routeSchema.optional(),
  settleReason: z.string().optional(),
});

export const capturedEventSchema = z.object({
  id: z.string(),
  t: z.number(),
  type: z.string(),
  target: eventTargetSchema,
  value: z.string().optional(),
  route: routeSchema,
  domSnapshot: fileRefSchema.optional(),
  screenshot: fileRefSchema.optional(),
  postAction: postActionSchema.optional(),
});

export const markerSchema = z.object({
  t: z.number(),
  label: z.string().optional(),
});

export const appMetaSchema = z.object({
  baseUrl: z.string(),
  userAgent: z.string(),
  viewport: z.object({ w: z.number(), h: z.number() }),
  devicePixelRatio: z.number(),
});

export const sessionManifestSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  app: appMetaSchema,
  audio: z.object({ file: z.string(), durationMs: z.number().optional() }).optional(),
  video: z.null().optional(),
  markers: z.array(markerSchema),
  events: z.array(capturedEventSchema),
});

export type SessionManifestInput = z.infer<typeof sessionManifestSchema>;
