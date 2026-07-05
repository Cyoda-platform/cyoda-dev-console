export interface ToolManifestEntry { name: string; description: string; inputSchema: Record<string, unknown> }

const empty = { type: "object", properties: {}, additionalProperties: false } as const;
const nameOnly = { type: "object", properties: { name: { type: "string", minLength: 1 } }, required: ["name"], additionalProperties: false } as const;
const nameAndContent = {
  type: "object",
  properties: { name: { type: "string", minLength: 1 }, content: { type: "string" } },
  required: ["name", "content"],
  additionalProperties: false,
} as const;
const stringArray = { type: "array", items: { type: "string" } } as const;

export const TOOL_MANIFEST: ToolManifestEntry[] = [
  { name: "list_workflows", description: "List discovered workflows: { workflows: [{ name, path, states, transitions, valid }] }.", inputSchema: empty },
  { name: "show_workflow", description: "Render a workflow in the browser editor and return its parsed document.", inputSchema: nameOnly },
  { name: "update_workflow", description: "Validate + whole-document write a workflow; returns a JSON diff. Writes nothing on failure.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, content: { type: "string" } }, required: ["name", "content"], additionalProperties: false } },
  { name: "optimize_layout", description: "Re-lay-out a workflow with elkjs and persist node positions to .layout.json.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, options: { type: "object", properties: { orientation: { enum: ["vertical", "horizontal"] }, preset: { enum: ["websiteCompact", "configuratorReadable", "opsAudit"] }, nodeSize: { type: "object", properties: { width: { type: "number" }, height: { type: "number" } }, required: ["width", "height"], additionalProperties: false }, pinned: { type: "array", items: { type: "object", properties: { id: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["id", "x", "y"], additionalProperties: false } } }, additionalProperties: false } }, required: ["name"], additionalProperties: false } },
  { name: "validate_workflow", description: "Parse + validate a workflow; returns diagnostics. Read-only.", inputSchema: nameOnly },
  { name: "connection_info", description: "Return the browser URL/port for the live editor.", inputSchema: empty },
  { name: "list_entities", description: "List discovered entities (separate plain-JSON object files matched by entityGlobs): { entities: [{ name, path }] }.", inputSchema: empty },
  { name: "get_entity", description: "Read a single entity's raw JSON contents by name.", inputSchema: nameOnly },
  { name: "create_entity", description: "Create a new entity file (name-based; destination directory derived from entityGlobs). Rejects if an entity with that name already exists.", inputSchema: nameAndContent },
  { name: "update_entity", description: "Overwrite an existing entity's whole-document JSON contents.", inputSchema: nameAndContent },
  { name: "delete_entity", description: "Delete an existing entity file.", inputSchema: nameOnly },
  { name: "configure_project", description: "Update the session's workflowGlobs/entityGlobs (and an optional display name) — never persisted to disk.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 200 }, workflowGlobs: stringArray, entityGlobs: stringArray }, additionalProperties: false } },
  { name: "get_project", description: "Report the project root, current workflowGlobs/entityGlobs, and workflow/entity counts.", inputSchema: empty },
];
