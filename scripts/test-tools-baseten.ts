// Phase 0: does Muse Spark Open on Baseten support tool calling?
// Decides whether Baseten can be the fallback for the Wonder agents (CLAUDE.md 5.7).
// Follows cookbook 01_api_fundamentals/03 (Chat Completions tools, call → feed back loop).
// Run: pnpm test:tools-baseten
import type OpenAI from "openai";
import { client, hasKey, MODELS } from "../src/lib/ai/clients.ts";
import { classifyError } from "../src/lib/ai/router.ts";

// Canned tool results — this tests the protocol, not real data.
function getRoadStatus(args: { road: string; place: string }) {
  return { road: args.road, place: args.place, status: "one_lane", cause: "landslide", clearsAround: "13:00-14:00" };
}
function getWeather(args: { place: string }) {
  return { place: args.place, rainNext6hMm: 12, tempC: 14 };
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_road_status",
      description: "Get the current verified status of a road at a named place in Himachal Pradesh.",
      parameters: {
        type: "object",
        properties: {
          road: { type: "string", description: "Road reference, e.g. NH3" },
          place: { type: "string", description: "Place name on that road, e.g. Aut" },
        },
        required: ["road", "place"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the rain forecast for the next 6 hours at a place.",
      parameters: {
        type: "object",
        properties: { place: { type: "string", description: "Place name, e.g. Aut" } },
        required: ["place"],
      },
    },
  },
];

async function main() {
  if (!hasKey("baseten")) {
    console.log("BASETEN_API_KEY missing — cannot run.");
    process.exitCode = 1;
    return;
  }
  const c = client("baseten", "agent");
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: "I'm driving Mandi to Kullu on NH3 now. Is the road at Aut open, and will it rain there? Use the tools.",
    },
  ];

  let toolCallsSeen = 0;
  let maxParallel = 0;
  let answer: string | null = null;

  for (let turn = 1; turn <= 4; turn++) {
    const r = await c.chat.completions.create({ model: MODELS.sparkOpen, messages, tools });
    const msg = r.choices[0]?.message;
    console.log(`turn ${turn}: finish_reason=${r.choices[0]?.finish_reason} tool_calls=${msg?.tool_calls?.length ?? 0}`);
    if (!msg?.tool_calls?.length) {
      answer = msg?.content ?? null;
      break;
    }
    toolCallsSeen += msg.tool_calls.length;
    maxParallel = Math.max(maxParallel, msg.tool_calls.length);
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      const args = JSON.parse(tc.function.arguments || "{}");
      console.log(`  → ${tc.function.name}(${JSON.stringify(args)})`);
      const result = tc.function.name === "get_road_status" ? getRoadStatus(args) : getWeather(args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  console.log("\nfinal answer:", answer ?? "(none)");
  const usedResults = !!answer && /one.?lane|landslide/i.test(answer) && /rain|12/i.test(answer);
  console.log("\n=== RESULT ===");
  console.log(`tool calls emitted: ${toolCallsSeen} (max ${maxParallel} in one turn)`);
  console.log(`answer used tool results: ${usedResults}`);
  console.log(
    toolCallsSeen > 0 && usedResults
      ? "TOOL CALLING WORKS on Baseten → usable as agent fallback"
      : "Tool calling NOT reliable on Baseten → agent fallback = code-built verdict",
  );
}

main().catch((err) => {
  const e = classifyError(err);
  console.log(`FAILED: ${e.kind}${e.status ? ` ${e.status}` : ""} — ${e.message}`);
  process.exitCode = 1;
});
