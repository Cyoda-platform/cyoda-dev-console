export interface ToolManifestEntry { name: string; description: string; inputSchema: Record<string, unknown> }

const empty = { type: "object", properties: {}, additionalProperties: false } as const;
const nameOnly = { type: "object", properties: { name: { type: "string", minLength: 1 } }, required: ["name"], additionalProperties: false } as const;

export const TOOL_MANIFEST: ToolManifestEntry[] = [
  { name: "list_workflows", description: "List discovered workflows: { workflows: [{ name, path, states, transitions, valid }] }.", inputSchema: empty },
  { name: "show_workflow", description: "Render a workflow in the browser editor and return its parsed document.", inputSchema: nameOnly },
  { name: "update_workflow", description: "Validate + whole-document write a workflow; returns a JSON diff. Writes nothing on failure.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, content: { type: "string" } }, required: ["name", "content"], additionalProperties: false } },
  { name: "optimize_layout", description: "Re-lay-out a workflow with elkjs and persist node positions to .layout.json.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, options: { type: "object", properties: { orientation: { enum: ["vertical", "horizontal"] }, preset: { enum: ["websiteCompact", "configuratorReadable", "opsAudit"] }, nodeSize: { type: "object", properties: { width: { type: "number" }, height: { type: "number" } }, required: ["width", "height"], additionalProperties: false }, pinned: { type: "array", items: { type: "object", properties: { id: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["id", "x", "y"], additionalProperties: false } } }, additionalProperties: false } }, required: ["name"], additionalProperties: false } },
  { name: "validate_workflow", description: "Parse + validate a workflow; returns diagnostics. Read-only.", inputSchema: nameOnly },
  { name: "connection_info", description: "Return the browser URL/port for the live editor.", inputSchema: empty },
];
