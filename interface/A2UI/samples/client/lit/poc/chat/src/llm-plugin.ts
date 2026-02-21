import type { Plugin, ViteDevServer } from "vite";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  RADAR_DATA,
  CATEGORY_WEIGHTS,
  computeComposite,
} from "./radar-data.js";

// ─── Terminal colors ───────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(label: string, color: string, ...args: unknown[]) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${C.dim}${ts}${C.reset} ${color}[${label}]${C.reset}`, ...args);
}

// ─── A2UI Validator & Repairer ─────────────────────────────────────

interface ComponentEntry {
  id: string;
  weight?: number;
  component: Record<string, Record<string, unknown>>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  repaired: boolean;
}

function getChildRefs(comp: ComponentEntry): string[] {
  const refs: string[] = [];
  const [typeName, props] = Object.entries(comp.component)[0] ?? [];
  if (!typeName || !props) return refs;

  if (typeName === "Card" || typeName === "Button") {
    if (typeof props.child === "string") refs.push(props.child);
  }

  if (typeName === "Column" || typeName === "Row" || typeName === "List") {
    const children = props.children as
      | {
          explicitList?: string[];
          template?: { componentId?: string };
        }
      | undefined;
    if (children?.explicitList) {
      refs.push(...children.explicitList);
    }
    if (children?.template?.componentId) {
      refs.push(children.template.componentId);
    }
  }

  return refs;
}

function detectCycle(
  id: string,
  compMap: Map<string, ComponentEntry>,
  visited: Set<string>,
  path: string[]
): string[] | null {
  if (visited.has(id)) return [...path, id];
  const comp = compMap.get(id);
  if (!comp) return null;

  visited.add(id);
  path.push(id);

  for (const childId of getChildRefs(comp)) {
    const cycle = detectCycle(childId, compMap, new Set(visited), [...path]);
    if (cycle) return cycle;
  }

  return null;
}

function removeSelfReferences(comp: ComponentEntry): boolean {
  const [typeName, props] = Object.entries(comp.component)[0] ?? [];
  if (!typeName || !props) return false;
  let repaired = false;

  if (
    (typeName === "Column" || typeName === "Row" || typeName === "List") &&
    props.children
  ) {
    const children = props.children as { explicitList?: string[] };
    if (children.explicitList) {
      const before = children.explicitList.length;
      children.explicitList = children.explicitList.filter(
        (cid) => cid !== comp.id
      );
      if (children.explicitList.length < before) repaired = true;
    }
  }

  if (
    (typeName === "Card" || typeName === "Button") &&
    props.child === comp.id
  ) {
    delete props.child;
    repaired = true;
  }

  return repaired;
}

function validateAndRepairMessages(
  messages: unknown[]
): ValidationResult & { messages: unknown[] } {
  const result: ValidationResult & { messages: unknown[] } = {
    valid: true,
    errors: [],
    warnings: [],
    repaired: false,
    messages,
  };

  const surfaceUpdates = messages.filter(
    (m): m is Record<string, unknown> =>
      !!m && typeof m === "object" && "surfaceUpdate" in m
  );
  const beginRenderings = messages.filter(
    (m): m is Record<string, unknown> =>
      !!m && typeof m === "object" && "beginRendering" in m
  );
  const dataModelUpdates = messages.filter(
    (m): m is Record<string, unknown> =>
      !!m && typeof m === "object" && "dataModelUpdate" in m
  );

  if (beginRenderings.length === 0) {
    result.errors.push("Missing beginRendering message");
    result.valid = false;
  }
  if (surfaceUpdates.length === 0) {
    result.errors.push("Missing surfaceUpdate message");
    result.valid = false;
  }
  if (dataModelUpdates.length === 0) {
    result.warnings.push("Missing dataModelUpdate message (may be intentional)");
  }

  for (const su of surfaceUpdates) {
    const update = su.surfaceUpdate as {
      surfaceId?: string;
      components?: ComponentEntry[];
    };
    const components = update?.components;
    if (!components || !Array.isArray(components)) {
      result.errors.push("surfaceUpdate.components is missing or not an array");
      result.valid = false;
      continue;
    }

    const compMap = new Map<string, ComponentEntry>();
    const duplicateIds: string[] = [];

    for (const comp of components) {
      if (!comp.id) {
        result.errors.push(
          `Component missing "id" field: ${JSON.stringify(comp).slice(0, 120)}`
        );
        result.valid = false;
        continue;
      }
      if (compMap.has(comp.id)) {
        duplicateIds.push(comp.id);
      }
      compMap.set(comp.id, comp);
    }

    if (duplicateIds.length > 0) {
      result.warnings.push(`Duplicate component IDs: ${duplicateIds.join(", ")}`);
    }

    for (const comp of components) {
      if (removeSelfReferences(comp)) {
        result.repaired = true;
        result.warnings.push(
          `REPAIRED: Removed self-reference in component "${comp.id}"`
        );
      }
    }

    for (const comp of components) {
      const cycle = detectCycle(comp.id, compMap, new Set(), []);
      if (cycle) {
        const cycleStr = cycle.join(" -> ");
        result.errors.push(`Circular dependency: ${cycleStr}`);
        result.valid = false;

        const loopBackId = cycle[cycle.length - 1];
        const parentIdx = cycle.indexOf(loopBackId);
        if (parentIdx < cycle.length - 1) {
          const parentId = cycle[cycle.length - 2];
          const parent = compMap.get(parentId);
          if (parent) {
            const [typeName, props] = Object.entries(parent.component)[0] ?? [];
            if (
              (typeName === "Column" ||
                typeName === "Row" ||
                typeName === "List") &&
              props?.children
            ) {
              const children = props.children as { explicitList?: string[] };
              if (children.explicitList) {
                children.explicitList = children.explicitList.filter(
                  (cid) => cid !== loopBackId
                );
                result.repaired = true;
                result.warnings.push(
                  `REPAIRED: Broke circular dep by removing "${loopBackId}" from "${parentId}" children`
                );
              }
            }
            if (
              (typeName === "Card" || typeName === "Button") &&
              props?.child === loopBackId
            ) {
              delete props.child;
              result.repaired = true;
              result.warnings.push(
                `REPAIRED: Broke circular dep by removing child "${loopBackId}" from "${parentId}"`
              );
            }
          }
        }
      }
    }

    for (const comp of components) {
      for (const childId of getChildRefs(comp)) {
        if (!compMap.has(childId)) {
          result.errors.push(
            `Component "${comp.id}" references missing child "${childId}"`
          );
          result.valid = false;
        }
      }
    }

    for (const br of beginRenderings) {
      const begin = br.beginRendering as { root?: string };
      if (begin?.root && !compMap.has(begin.root)) {
        result.errors.push(
          `beginRendering root "${begin.root}" not found in components`
        );
        result.valid = false;
      }
    }
  }

  return result;
}

// ─── Build RadarAI context for the system prompt ──────────────────

function buildRadarContext(): string {
  const lines: string[] = [];

  lines.push("## RadarAI Company Intelligence Data (Live Backend)\n");
  lines.push(`As-of date: ${RADAR_DATA.metadata.as_of}`);
  lines.push(`Peer group: ${RADAR_DATA.metadata.peer_group}`);
  lines.push(`Score scale: ${RADAR_DATA.metadata.score_scale}\n`);
  lines.push("### Radar Dimensions & Category Weights\n");

  for (const dim of RADAR_DATA.dimensions) {
    const w = CATEGORY_WEIGHTS[dim];
    lines.push(`- **${dim}**: weight ${(w * 100).toFixed(0)}%`);
  }

  lines.push("\n### Company Scores (0-100 percentile within peer group)\n");

  for (const company of RADAR_DATA.companies) {
    const composite = computeComposite(company.scores);
    lines.push(`#### ${company.label} (${company.ticker}) — Composite: ${composite}`);
    for (const dim of RADAR_DATA.dimensions) {
      lines.push(`  - ${dim}: ${company.scores[dim]}`);
    }
    lines.push("");
  }

  lines.push("### Ranking Summary\n");

  const ranked = RADAR_DATA.companies
    .map((c) => ({ label: c.label, composite: computeComposite(c.scores) }))
    .sort((a, b) => b.composite - a.composite);

  for (let i = 0; i < ranked.length; i++) {
    lines.push(`${i + 1}. ${ranked[i].label}: ${ranked[i].composite}`);
  }

  return lines.join("\n");
}

// ─── System Prompt ─────────────────────────────────────────────────

const A2UI_SYSTEM_PROMPT = `You are RadarAI, a Company Intelligence Radar assistant specialized in fashion industry analysis. You have access to a backend scoring system that rates 7 global fashion companies across 9 analytical dimensions on a 0-100 percentile scale.

Your primary capabilities:
1. Visualize company radar scores as interactive charts (radar, bar, line, etc.)
2. Compare companies across dimensions
3. Explain scoring methodology and investment implications
4. Drill down into specific dimensions or companies

${buildRadarContext()}

### Scoring Methodology
- **Method**: Robust z-score normalization (median-based, outlier-resistant)
- **Clamping**: ±3 standard deviations
- **Missing data**: Reweighted among available signals
- **Focus**: Structurally predictive metrics that signal long-term compounding potential
- ROIC, revenue durability, and margin stability are weighted most heavily
- Capital allocation discipline and competitive advantage indicators are critical

### Key Insights to Reference
- **Inditex** leads on Capital Discipline (90) driven by exceptional ROIC and FCF generation
- **Lululemon** leads on Profitability (92) with industry-best gross margins and DTC model
- **Nike** leads on Competitive Positioning (88) due to brand power and market share, but Narrative momentum (38) is weak due to recent restructuring
- **Fast Retailing** leads on Growth Quality (90) driven by Uniqlo international expansion
- **adidas** has strong Narrative Momentum (82) reflecting turnaround sentiment
- **Under Armour** scores lowest across most dimensions, reflecting brand and operational challenges
- **H&M** is mid-pack but weak on Structural Risk (38) due to geographic/supplier concentration

When the user asks a question, respond with a visually rich A2UI interface. Default to radar charts for company comparisons. Use bar charts for single-dimension comparisons. Use the actual score data above — never make up numbers.

Your response MUST be a valid JSON array of A2UI messages. Do NOT include any text outside the JSON. Do NOT wrap in markdown fences.

## A2UI Message Format

Each response is a JSON array containing three types of messages (in this order):

1. **beginRendering** — signals the client to start rendering:
   { "beginRendering": { "surfaceId": "default", "root": "<root-component-id>" } }

2. **surfaceUpdate** — defines the flat component tree:
   { "surfaceUpdate": { "surfaceId": "default", "components": [ ... ] } }

3. **dataModelUpdate** — provides data values for data-bound components:
   { "dataModelUpdate": { "surfaceId": "default", "path": "/", "contents": [ ... ] } }

## Available Components (ONLY these exist — there are NO others)

Components are defined in a FLAT adjacency list. Each component has a unique "id" and a "component" object with exactly one key (the component type).

### Layout
- **Column**: { "Column": { "children": { "explicitList": ["child-id-1", "child-id-2"] } } }
- **Row**: { "Row": { "children": { "explicitList": ["child-id-1", "child-id-2"] } } }
  - Direct children can have a "weight" field (flex-grow) on their component entry
- **List**: { "List": { "direction": "vertical"|"horizontal", "children": { "template": { "componentId": "template-id", "dataBinding": "/items" } } } }
  - Use template+dataBinding to generate children from data model maps
- **Card**: { "Card": { "child": "content-id" } }
- **Divider**: { "Divider": {} }

### Display
- **Text**: { "Text": { "text": { "literalString": "Hello" }, "usageHint": "h1"|"h2"|"h3"|"h4"|"h5"|"body"|"caption" } }
  - text can be { "literalString": "..." } or { "path": "fieldName" } for data binding
- **Image**: { "Image": { "url": { "literalString": "https://..." }, "usageHint": "icon"|"avatar"|"smallFeature"|"mediumFeature"|"largeFeature"|"header" } }
- **Icon**: { "Icon": { "name": { "literalString": "star" } } }
  - Available icons: accountCircle, add, arrowBack, arrowForward, calendarToday, call, check, close, delete, download, edit, error, event, favorite, favoriteOff, folder, help, home, info, locationOn, lock, mail, menu, notifications, payment, person, phone, search, send, settings, share, shoppingCart, star, starHalf, starOff, upload, warning

### Interactive
- **Button**: { "Button": { "child": "button-text-id", "primary": true, "action": { "name": "action_name", "context": [ { "key": "k", "value": { "path": "field" } } ] } } }
- **TextField**: { "TextField": { "label": { "literalString": "Name" }, "text": { "path": "name" }, "type": "shortText"|"longText"|"number"|"date"|"obscured" } }
- **CheckBox**: { "CheckBox": { "label": { "literalString": "Agree" }, "value": { "path": "agreed" } } }
- **DateTimeInput**: { "DateTimeInput": { "label": { "literalString": "Date" }, "value": { "path": "date" }, "enableDate": true, "enableTime": true } }

## Charts and Graphs (CUSTOM "Chart" component)

A custom **Chart** component is registered. Use it for ALL chart/graph requests. Do NOT use Image+QuickChart or try to fake charts with Rows/Text.

Chart component properties:
- **chartType** (required): "bar" | "line" | "pie" | "doughnut" | "radar" | "polarArea" | "scatter" | "bubble"
- **labels** (required): string array of x-axis / category labels
- **datasets** (required): array of dataset objects, each with:
  - **label** (string): legend label for this series
  - **data** (number[]): values, one per label
  - **backgroundColor** (string or string[]): fill color(s), use rgba() for transparency
  - **borderColor** (string or string[]): stroke color(s)
  - **borderWidth** (number): stroke width, default 2
  - **fill** (boolean): fill area under line, default false (true for radar)
  - **tension** (number): line smoothing 0-1, default 0.3
- **title** (string, optional): chart title displayed above the chart
- **stacked** (boolean, optional): stack bars/lines, default false
- **indexAxis** (string, optional): "x" (default vertical) or "y" (horizontal bar)

**Interactive:** Users can click on any data point in a chart. When they do, a \`chart_point_click\` action fires automatically with context: chartType, datasetLabel, label, value, datasetIndex, dataIndex. The app handles this and sends a follow-up message to you. When you receive a chart_point_click follow-up, respond with an insightful drill-down analysis or a new chart that zooms into that data point.

Usage: { "Chart": { "chartType": "bar", "labels": [...], "datasets": [...], "title": "..." } }

## Data Model Format

The dataModelUpdate contents array uses this recursive structure:
- String: { "key": "name", "valueString": "John" }
- Number: { "key": "age", "valueNumber": 30 }
- Boolean: { "key": "active", "valueBoolean": true }
- Nested map: { "key": "address", "valueMap": [ { "key": "city", "valueString": "NYC" } ] }

Within templates (List with template children), data paths are relative to each item in the bound map.

## Example: Radar Chart (Company Comparison)

[
  { "beginRendering": { "surfaceId": "default", "root": "radar-card" } },
  { "surfaceUpdate": { "surfaceId": "default", "components": [
    { "id": "radar-card", "component": { "Card": { "child": "radar-col" } } },
    { "id": "radar-col", "component": { "Column": { "children": { "explicitList": ["radar-heading-text", "perf-radar-chart", "radar-caption-text"] } } } },
    { "id": "radar-heading-text", "component": { "Text": { "text": { "literalString": "Fashion Industry Intelligence Radar" }, "usageHint": "h2" } } },
    { "id": "perf-radar-chart", "component": { "Chart": { "chartType": "radar", "labels": ["Growth Quality", "Revenue Durability", "Profitability", "Capital Discipline", "Competitive Positioning", "Narrative Momentum", "Governance", "Expectation vs Reality", "Structural Risk"], "datasets": [{ "label": "Nike", "data": [52, 82, 78, 75, 88, 38, 65, 42, 55], "backgroundColor": "rgba(245, 130, 32, 0.25)", "borderColor": "#F58220" }, { "label": "Lululemon", "data": [85, 78, 92, 88, 76, 72, 70, 65, 68], "backgroundColor": "rgba(190, 30, 45, 0.25)", "borderColor": "#BE1E2D" }] } } },
    { "id": "radar-caption-text", "component": { "Text": { "text": { "literalString": "Click any data point to drill down into that dimension" }, "usageHint": "caption" } } }
  ] } },
  { "dataModelUpdate": { "surfaceId": "default", "path": "/", "contents": [
    { "key": "placeholder", "valueString": "" }
  ] } }
]

## CRITICAL RULES — violating these causes rendering failures

1. ALWAYS return a valid JSON array — no markdown fences, no commentary outside JSON.
2. ALWAYS use surfaceId "default" for all messages.
3. ALWAYS include all three message types: beginRendering, surfaceUpdate, dataModelUpdate.
4. Every component referenced as a child/template MUST be defined in the components array.
5. The root component in beginRendering MUST exist in the surfaceUpdate components.
6. **NEVER reference a component as its own child.** A component's "child" or "explicitList" MUST ONLY contain IDs of OTHER components. Self-references cause fatal circular dependency errors.
7. **Every component ID must be globally unique within the surface.** Never reuse an ID.
8. **Use DIFFERENT, descriptive IDs for every component.** For example, use "profile-name-text" not "name", use "weather-temp-text" not "temperature". Avoid generic IDs that match data field names.
9. Use data binding (path) for dynamic content and literalString for static labels.
10. For lists of items, prefer List with template + dataBinding over manual explicitList.
11. Generate rich, visually appealing UIs — use headings, icons, cards, and good layout structure.
12. Use Cards to group related content visually.
13. **For any chart, graph, or visualization request, use the custom "Chart" component.** See the "Charts and Graphs" section above for properties. NEVER fake charts with Rows/Text or use Image+QuickChart.
14. When generating Chart component JSON, the "labels" array and "datasets" array are direct JSON (not strings). Each dataset's "data" array must have the same length as "labels".
15. **Wrap every Chart in a Card for consistent styling.** Add a heading Text above and optionally a caption Text below explaining click-to-drill-down.
16. **Use the REAL company score data provided above.** Never invent scores. Always reference actual values from the backend data.`;

// ─── Session state ─────────────────────────────────────────────────

const sessions = new Map<string, MessageParam[]>();

// ─── Plugin ────────────────────────────────────────────────────────

export function a2uiLLMPlugin(): Plugin {
  return {
    name: "anthropic-a2ui",
    configureServer(server: ViteDevServer) {
      // ── /api/radar — serves radar score data to the frontend ──
      server.middlewares.use("/api/radar", (_req, res) => {
        log("API", C.green, "Serving radar data");
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(RADAR_DATA));
      });

      // ── /api/chat — LLM endpoint ──
      server.middlewares.use("/api/chat", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const { message, sessionId, image } = JSON.parse(body);

            log("USER", C.cyan, image ? `${message} [+ annotated screenshot]` : message);

            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
              const err =
                "ANTHROPIC_API_KEY not set. Create a .env file with ANTHROPIC_API_KEY=your-key";
              log("ERROR", C.red, err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err }));
              return;
            }

            const client = new Anthropic({ apiKey });

            if (!sessions.has(sessionId)) {
              sessions.set(sessionId, []);
            }
            const history = sessions.get(sessionId)!;

            const userContent: MessageParam["content"] = image
              ? [
                  {
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: "image/png" as const,
                      data: image,
                    },
                  },
                  { type: "text" as const, text: message },
                ]
              : message;
            history.push({ role: "user", content: userContent });

            log("LLM", C.blue, "Calling Claude...");
            const response = await client.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 8192,
              system: A2UI_SYSTEM_PROMPT,
              messages: history,
            });

            const textBlock = response.content.find(
              (block) => block.type === "text"
            );
            const rawText =
              textBlock && "text" in textBlock ? textBlock.text : "[]";

            log(
              "RAW",
              C.dim,
              `Claude response (${rawText.length} chars):\n${rawText}`
            );

            let a2uiMessages: unknown[];
            try {
              let cleaned = rawText.trim();
              if (cleaned.startsWith("```")) {
                cleaned = cleaned
                  .replace(/^```(?:json)?\s*/, "")
                  .replace(/\s*```$/, "");
                log("PARSE", C.yellow, "Stripped markdown fences from response");
              }
              a2uiMessages = JSON.parse(cleaned);
              if (!Array.isArray(a2uiMessages)) {
                a2uiMessages = [a2uiMessages];
                log("PARSE", C.yellow, "Wrapped non-array response in array");
              }
              log("PARSE", C.green, `Parsed ${a2uiMessages.length} A2UI messages`);
            } catch (parseErr) {
              log(
                "PARSE",
                C.red,
                `JSON parse failed: ${parseErr}\nFirst 500 chars: ${rawText.slice(0, 500)}`
              );
              a2uiMessages = [];
            }

            if (a2uiMessages.length > 0) {
              const validation = validateAndRepairMessages(a2uiMessages);

              if (validation.warnings.length > 0) {
                for (const w of validation.warnings) {
                  log("WARN", C.yellow, w);
                }
              }

              if (validation.errors.length > 0) {
                for (const e of validation.errors) {
                  log("ERROR", C.red, e);
                }
              }

              if (validation.repaired) {
                log(
                  "REPAIR",
                  C.magenta,
                  "Auto-repaired the A2UI JSON (see warnings above)"
                );
                a2uiMessages = validation.messages;

                const recheck = validateAndRepairMessages(a2uiMessages);
                if (recheck.errors.length > 0) {
                  log(
                    "REPAIR",
                    C.red,
                    "Still has errors after repair:",
                    recheck.errors
                  );
                } else {
                  log("REPAIR", C.green, "Post-repair validation passed");
                }
              } else if (validation.valid) {
                log("VALID", C.green, "A2UI JSON passed all validation checks");
              }
            }

            history.push({ role: "assistant", content: rawText });

            log("SEND", C.green, `Sending ${a2uiMessages.length} messages to client`);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ messages: a2uiMessages }));
          } catch (err) {
            log("ERROR", C.red, "Anthropic API error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        });
      });
    },
  };
}
