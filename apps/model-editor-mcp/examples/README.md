# model-editor-mcp — example project

A small, self-contained Cyoda model for exercising `model-editor-mcp` (development
+ dogfooding). Point the server at this directory:

```
node apps/model-editor-mcp/dist/index.js --project apps/model-editor-mcp/examples
```

It matches the default narrow globs (`models/workflow/**/*.json`,
`models/schema/**/*.json`), so no `--workflow-globs`/`--entity-globs` needed.

## Contents

**Workflows** (`models/workflow/`) — branchy state machines, good for exercising the
graph render and `optimize_layout`:
- `Order` — cart → pending → confirmed → shipped → delivered, with cancel/return/refund branches
- `Payment` — initiated → authorized → captured, with fail/retry, void, refund branches
- `Shipment` — label_created → in_transit → out_for_delivery → delivered, with delay/fail/retry loops

**Entities** (`models/schema/`) — plain JSON-Schema objects:
- `Order`, `Payment`, `Customer`

Workflow and entity basenames intentionally overlap (`Order`, `Payment`) to mirror
the real convention where an entity's workflow shares its name.

Content here is Claude-owned in the editor (the graph warns on edit, the JSON pane
is read-only); layout you arrange is written back as `*.layout.json` sidecars.
