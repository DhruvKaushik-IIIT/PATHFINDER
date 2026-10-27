// Server-only: SAM 3.1 image segmentation. Follows cookbook 07_sam/01_api_basics:
// stream over the Responses API, decode with the official @meta-sam/parser.
// One short noun phrase per request.
import {
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import { client, MODELS } from "./clients.ts";

export interface SamBox {
  objectId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  confidence?: number;
}

export interface SamMask {
  objectId: string;
  bounds: { left: number; top: number; right: number; bottom: number };
  /** Foreground area in source-image pixels (raster area scaled to the bounds). */
  areaPx: number;
  confidence?: number;
  record: SegmentationMaskRecord;
}

export interface SamResult {
  concept: string;
  boxes: SamBox[];
  masks: SamMask[];
}

// The API streams `response.content_part.done` but not `response.output_text.done`,
// which the parser needs to finalise a text lane — synthesise it (copied from the recipe).
async function* normalizedEvents(stream: AsyncIterable<unknown>): AsyncIterable<ResponsesEvent> {
  const completed = new Set<string>();
  for await (const raw of stream) {
    const event = raw as {
      type?: string;
      item_id?: unknown;
      output_index?: unknown;
      content_index?: unknown;
      part?: { type?: unknown; text?: unknown } | null;
    };
    const lane = `${String(event.item_id)}:${String(event.output_index)}:${String(event.content_index)}`;
    if (event.type === "response.output_text.done") {
      if (!completed.has(lane)) {
        completed.add(lane);
        yield event as unknown as ResponsesEvent;
      }
      continue;
    }
    yield event as unknown as ResponsesEvent;
    if (
      event.type === "response.content_part.done" &&
      !completed.has(lane) &&
      event.part?.type === "output_text" &&
      typeof event.part.text === "string"
    ) {
      completed.add(lane);
      yield {
        type: "response.output_text.done",
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        text: event.part.text,
      } as unknown as ResponsesEvent;
    }
  }
}

/** Throws on HTTP errors or an incomplete/invalid stream; the caller (router) decides the fallback. */
export async function segmentImage(jpeg: Buffer, concept: string): Promise<SamResult> {
  const phrase = concept.trim();
  const stream = await client("meta", "agent").responses.create({
    model: MODELS.sam,
    stream: true,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: phrase },
          { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "auto" },
        ],
      },
    ],
  });
  const result: ImageSegmentationResult = await parseImageStream(
    normalizedEvents(stream as AsyncIterable<unknown>),
  ).finalResult;

  if (result.outcome.status !== "completed") {
    throw new Error(`SAM incomplete: ${result.outcome.reason} ${result.outcome.detail ?? ""}`.trim());
  }
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new Error(`SAM parser rejected records: ${errors.map((e) => e.message).join("; ")}`);

  return {
    concept: phrase,
    boxes: recordsOfKind(result.records, "box").map((b) => ({
      objectId: b.objectId, left: b.left, top: b.top, right: b.right, bottom: b.bottom, confidence: b.confidence,
    })),
    masks: recordsOfKind(result.records, "mask").map((m) => {
      const fg = decodeMaskToRaster(m.mask).reduce((t, v) => t + v, 0);
      const rasterArea = m.mask.width * m.mask.height || 1;
      const boundsArea = (m.bounds.right - m.bounds.left) * (m.bounds.bottom - m.bounds.top);
      return {
        objectId: m.objectId,
        bounds: m.bounds,
        areaPx: Math.round((fg / rasterArea) * boundsArea),
        confidence: m.confidence,
        record: m,
      };
    }),
  };
}
