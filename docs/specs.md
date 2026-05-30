
The design leans on the existing direction that the Developer Console is a developer tool, not a generic SaaS/admin dashboard, and that the separate cyoda-workflow-editor package is expected to become the Phase 2 workflow editing surface.  ￼ It also respects the workflow editor’s contract that canonical workflow JSON is clean and editor metadata is excluded from serializeImportPayload.  ￼

# Cyoda Dev Console and Ops Console Implementation Specification

> **Scope correction (2026-05-30):** This implementation cycle targets a single application — the **Cyoda Dev Console**. The Ops Console (§7), `cyoda-api-client` (§9.1), and `runtime-inspection` packages are deferred. Sections describing them remain for historical context but are NOT in scope for the phases tracked under `docs/phases/`.
Status: Final implementation specification
Scope: Desktop Dev Console and Ops Console architecture
Excluded: BYO AI implementation details, which live in a separate specification
Target implementer: AI coding agent working in the new shared console monorepo
Primary stack: Tauri 2 + React + TypeScript + Vite
Primary workflow surface: cyoda-workflow-editor
---
## 1. Purpose
Build two sibling desktop applications:
1. Cyoda Dev Console
2. Cyoda Ops Console
Both are installed as standalone desktop applications via Homebrew Cask.
The Dev Console is a local-project, file-based workflow and model review/editing tool. Its primary purpose is to wrap the `cyoda-workflow-editor` package so a developer can inspect and manually correct generated workflow definitions during the build phase.
The Ops Console is a runtime inspection and operations tool. Its primary purpose is to connect to a running Cyoda environment and view deployed workflows, entities, instances, runtime state, processing status, and operational data. It must be read-only by default for production-style environments. Changes to configuration/code should normally flow through Git and the Dev Console, not directly into a running system.
The two applications must feel like sibling products, but their domain logic must stay separate.
---
## 2. Product separation
### 2.1 Dev Console
The Dev Console is for the build/design phase.
Primary jobs:
- Select a local Cyoda project or workflow root directory.
- Recursively discover workflow JSON files.
- Display all discovered workflows in a navigable file/project tree.
- Open workflow files in `cyoda-workflow-editor`.
- Allow visual and JSON editing of workflows.
- Save clean workflow JSON back to disk.
- Warn before overwriting files.
- Detect external file changes.
- Show lightweight entity/model files where available.
- Open files or folders in the user’s preferred IDE.
- Integrate with BYO AI only through the separate BYO AI specification.
Non-goals:
- Do not become a code editor.
- Do not become an IDE.
- Do not embed a terminal in v1.
- Do not edit processor code.
- Do not manage build systems.
- Do not directly deploy to running environments.
- Do not duplicate functionality already present in `cyoda-workflow-editor`.
### 2.2 Ops Console
The Ops Console is for the runtime/operations phase.
Primary jobs:
- Connect to a local or remote Cyoda backend.
- View deployed workflow definitions.
- View entity instances and state transitions.
- View runtime status, processing nodes, events, reports and operational information where available.
- Export deployed workflow JSON.
- Compare deployed workflows with local/Git workflow files where possible.
- Generate change tasks that can be taken back to the Dev Console or Git workflow.
Non-goals:
- Do not allow normal users to directly edit live workflow configuration.
- Do not allow production mutations by default.
- Do not become a build tool.
- Do not become a project file manager.
- Do not embed a general-purpose code editor.
### 2.3 Emergency/break-glass edits
If future Ops Console versions support emergency edits:
- Disabled by default.
- Requires explicit session-level enablement.
- Requires typed confirmation.
- Requires a cooldown banner before write execution.
- Must create an audit record.
- Must export a before/after patch.
- Must provide rollback JSON.
- Not part of MVP.
---
## 3. Technology choice
### 3.1 Desktop shell
Use Tauri 2 for both Dev Console and Ops Console.
Rationale:
- Small desktop footprint.
- Strong native filesystem support.
- Works with existing React/Vite/TypeScript stack.
- Allows controlled native commands without a full Electron/Chromium bundle.
- Suitable for Homebrew Cask distribution.
- Allows secure Rust-side file scanning, file watching, and OS integrations.
Electron is not the default. It may be reconsidered only if Tauri blocks an essential requirement such as authentication or enterprise packaging.
### 3.2 Frontend stack
Use:
- React
- TypeScript
- Vite
- TanStack Query for server state
- Zustand or equivalent small state store for local UI/project state
- IBM Plex Sans and IBM Plex Mono
- Carbon-inspired layout and component language
- Light mode only
- Cyoda green `#004235` as primary
- Cyoda orange `#F58220` for warnings and production-risk cues
The existing console direction already uses React, TypeScript, Vite, Ant Design, TanStack Query, Zustand, IBM Plex fonts, and a light Carbon-inspired visual direction. Preserve that product language. The current product direction explicitly says the console is a developer-facing tool, not a generic admin dashboard.  [oai_citation:2‡AI_CONTEXT.md](sediment://file_00000000e40c71f79703c3267a8b49fa)
### 3.3 Workflow editor
Use the independent `cyoda-workflow-editor` packages as the primary workflow editing surface.
Required packages:
- `@cyoda/workflow-core`
- `@cyoda/workflow-react`
- `@cyoda/workflow-monaco`
- `@cyoda/workflow-layout`
Required behaviours from `cyoda-workflow-editor`:
- Parse workflow JSON via `parseImportPayload`.
- Edit visually through `WorkflowEditor`.
- Enable JSON editing where useful.
- Save using `serializeImportPayload`.
- Exclude editor metadata from saved workflow JSON.
The workflow editor already describes canonical state as the Cyoda workflow JSON, with graph/layout/comments as projections or metadata only. Layout positions, comments, edge anchors and viewports are stored in `WorkflowEditorDocument.meta.workflowUi` and are never included in `serializeImportPayload`.  [oai_citation:3‡README.md](sediment://file_000000000c3c71fdac9b3f1897c0ca6f)
---
## 4. Repository strategy
Use one shared monorepo with two apps and shared packages.
Suggested structure:
```txt
cyoda-console/
  apps/
    dev-console/
      src/
      src-tauri/
    ops-console/
      src/
      src-tauri/
  packages/
    console-shell/
    console-design-system/
    workflow-file-indexer/
    workflow-project-model/
    workflow-editor-host/
    entity-model-viewer/
    cyoda-api-client/
    runtime-inspection/
    agent-bridge-contract/

4.1 App packages

apps/dev-console

Tauri desktop app for local file-based workflow editing.

Owns:

* first-run project-root wizard;
* local workflow discovery UI;
* workflow file tree;
* workflow editor host screen;
* local save/revert/overwrite flows;
* lightweight entity/model viewer;
* IDE open/reveal integrations;
* BYO AI integration points only as specified in the separate BYO AI spec.

apps/ops-console

Tauri desktop app for runtime inspection.

Owns:

* environment connection setup;
* runtime navigation;
* deployed workflow viewer;
* entity instance views;
* runtime status and operational panels;
* export/compare workflows;
* change task generation.

4.2 Shared packages

packages/console-design-system

Purpose:

* Shared design tokens.
* IBM Plex font loading.
* colour tokens;
* spacing;
* typography;
* common icons;
* common primitive components.

Must not contain product/domain logic.

Exports examples:

export { ConsoleThemeProvider } from "./theme/ConsoleThemeProvider";
export { tokens } from "./theme/tokens";
export { Button } from "./components/Button";
export { Panel } from "./components/Panel";
export { EmptyState } from "./components/EmptyState";
export { WarningBanner } from "./components/WarningBanner";
export { FilePath } from "./components/FilePath";

packages/console-shell

Purpose:

* Shared app frame.
* Sidebar layout.
* Header layout.
* command/status area;
* common route layout;
* window title helpers.

Must remain domain-neutral.

It can know there are products called Dev Console and Ops Console, but it must not import workflow or runtime domain packages.

packages/workflow-file-indexer

Purpose:

* Native-facing TypeScript types for workflow discovery.
* Rust command result types.
* file classification rules.
* glob defaults.
* parse status modelling.

Can be used by Dev Console only, but may be shared if Ops Console later compares deployed workflows with local files.

packages/workflow-project-model

Purpose:

* Project root config.
* Recent projects.
* workflow/entity relationship inference.
* project metadata schema.
* app-level persistence schema.

No React dependency unless unavoidable.

packages/workflow-editor-host

Purpose:

* Wrapper around cyoda-workflow-editor.
* Dirty state.
* file save/revert flow.
* overwrite confirmation;
* external file change handling;
* metadata persistence policy.

This is the main integration layer for Dev Console.

packages/entity-model-viewer

Purpose:

* Lightweight entity/model viewer.
* JSON tree view.
* validation hook if schema exists.
* “Open in IDE” / “Reveal in Finder” actions.

Must not become a full editor or IDE.

packages/cyoda-api-client

Purpose:

* Shared client for Ops Console.
* Backend mode handling.
* authentication integration where needed.
* workflow/entity/runtime API access.

packages/runtime-inspection

Purpose:

* Ops Console runtime panels.
* workflows read-only view.
* entity instance state/history.
* processing/running system views.

packages/agent-bridge-contract

Purpose:

* Shared types for BYO AI integration points.
* Generated task-bundle metadata types.
* No implementation detail here unless required by the separate BYO AI spec.

Do not implement BYO AI here in this spec.

⸻

5. Installation and distribution

5.1 Homebrew Cask

Ship separate Homebrew casks:

brew install --cask cyoda-dev-console
brew install --cask cyoda-ops-console

Do not ask the project root during brew install.

Homebrew installation must remain declarative and non-interactive. Project root selection happens inside the Dev Console first-run wizard.

5.2 macOS signing

Release artifacts must be:

* signed with Apple Developer ID;
* notarized;
* stapled;
* distributed as .dmg, .app.zip, or equivalent Tauri-supported signed artifact;
* referenced from the Homebrew cask.

5.3 Updates

MVP uses:

brew upgrade --cask cyoda-dev-console
brew upgrade --cask cyoda-ops-console

Do not implement in-app auto-update in MVP.

⸻

6. Dev Console functional specification

6.1 First-run wizard

On first launch, if no project root is configured:

Screen title:

Choose your Cyoda project

Body:

Select the root folder that contains your Cyoda workflows, entity models, or generated application files.

Primary action:

Select folder

The folder picker must use Tauri native filesystem APIs.

After selection:

* persist project root in app config;
* scan for workflows;
* show discovery results;
* allow user to proceed to the main editor.

Persist config in the OS-appropriate app config directory, for macOS:

~/Library/Application Support/Cyoda Dev Console/config.json

Do not store secrets in this config.

6.2 Multiple project roots

MVP should support at least:

* one active project;
* recent project list;
* switch project;
* remove project from recent list.

Data model:

type DevProject = {
  id: string;
  name: string;
  rootPath: string;
  workflowGlobs: string[];
  entityGlobs: string[];
  createdAt: string;
  lastOpenedAt: string;
};

Default workflow globs:

**/*.json

Exclusions:

node_modules/**
.git/**
dist/**
build/**
target/**
.turbo/**
.next/**
coverage/**

Future versions can add explicit cyoda.project.json.

6.3 Workflow discovery

The native side scans recursively from the active root.

For each JSON file:

1. Read file.
2. Attempt JSON parse.
3. Attempt parseImportPayload.
4. Classify file.

Type:

type WorkflowFileStatus =
  | "valid-workflow"
  | "invalid-workflow"
  | "json-not-workflow"
  | "parse-error";
type WorkflowFileIndexEntry = {
  path: string;
  relativePath: string;
  status: WorkflowFileStatus;
  workflows: Array<{
    name: string;
    version?: string;
    entity?: string;
  }>;
  lastModified: string;
  sizeBytes: number;
  error?: string;
};

The scanner must be robust:

* one bad file must not fail the whole scan;
* scan results must include parse errors;
* large folders must not freeze the UI;
* scanning must be cancellable or debounced;
* exclude ignored directories by default.

6.4 Main Dev Console layout

Recommended layout:

┌─────────────────────────────────────────────────────────────────┐
│ Cyoda Dev Console   Project: order-demo   Root: /path/...       │
├─────────────────────────────────────────────────────────────────┤
│ Workflows | Entities | Project                                  │
├───────────────┬─────────────────────────────────────────────────┤
│ File tree     │ Workflow editor / entity viewer                 │
│               │                                                 │
│ workflows/    │                                                 │
│  order.json   │                                                 │
│  payment.json │                                                 │
│ entities/     │                                                 │
│  Order.json   │                                                 │
└───────────────┴─────────────────────────────────────────────────┘

Requirements:

* maximise editor real estate;
* no excessive dashboard chrome;
* collapsible left file tree;
* dirty indicator visible in header;
* current file path visible;
* validation status visible;
* save/revert controls close to the active file context.

6.5 Workflow editor host

When a workflow file is opened:

* parse using parseImportPayload;
* show parse errors if invalid;
* if valid, render WorkflowEditor;
* enable graph editing;
* enable JSON editor if Monaco is available;
* pass developerMode={true};
* pass local metadata persistence key scoped by project/file;
* track dirty state;
* track baseline serialized workflow JSON.

Dirty state:

dirty = serializeImportPayload(currentDocument) !== savedBaseline

Do not compare editor metadata.

Save:

* call serializeImportPayload(currentDocument);
* show overwrite confirmation before writing;
* write only clean workflow JSON;
* update baseline after success;
* keep dirty state true if write fails.

Save As:

* folder/file picker;
* write clean workflow JSON;
* update active file if user chooses.

Revert:

* if dirty, confirm discard;
* reread file from disk;
* reparse;
* reset editor state and baseline.

6.6 Overwrite confirmation

Before saving to an existing file, show:

Title:

Overwrite workflow file?

Body:

This will replace the contents of:
<path>
Only clean Cyoda workflow JSON will be written. Editor layout, comments, edge anchors, and viewport state will not be saved into the workflow file.

Actions:

* Cancel
* Overwrite file

6.7 External file changes

Use native file watching.

Requirements:

* watch active project root;
* debounce filesystem events;
* ignore write events caused by the Dev Console’s own save operation;
* detect if the currently-open file changed externally;
* show non-blocking warning.

Warning:

This file changed on disk.

Actions:

* Reload from disk
* Compare
* Keep current version

Important implementation warning:

The Monaco JSON editor inside cyoda-workflow-editor uses debounced synchronization. The native file watcher must not race with editor keystrokes or the app’s own save operation. Add a save-origin marker and debounce external notifications long enough to avoid false positives.

Acceptance rule:

* Typing in the JSON tab must not trigger “file changed on disk”.
* Saving from Dev Console must not trigger an external-change warning.
* Editing the file in another app must trigger the warning.

6.8 Compare view

MVP should provide a basic compare when external changes are detected:

* current editor serialized JSON;
* disk file JSON;
* side-by-side Monaco diff if available;
* otherwise plain text diff.

Actions:

* Keep mine
* Reload disk version
* Cancel

6.9 Entity/model viewing

The Dev Console should show entity/model files lightly.

MVP:

* discover likely entity JSON files;
* show file tree;
* open in JSON viewer;
* allow simple text/JSON editing only if low-cost and safe;
* show validation if schema exists;
* show relationships to workflows if inferable.

Non-goals:

* no processor code editing;
* no class/code editing;
* no full search-and-replace;
* no refactoring UI;
* no embedded compiler.

Actions:

* Open in IDE
* Reveal in Finder
* Copy path

6.10 Open in IDE

Supported IDEs in MVP:

* Zed
* IntelliJ IDEA
* VS Code
* Finder

The app should detect availability where possible. If detection is not available, show manual instructions.

The Tauri native layer must use an allowlist of known commands. No arbitrary command execution.

⸻

7. Ops Console functional specification

7.1 Connection setup

Ops Console starts with connection setup if no environment is configured.

Supported environments:

* local cyoda-go
* Cyoda Cloud/dev
* Cyoda Cloud/prod

Connection configuration must be distinct from Dev Console project roots.

7.2 Main Ops layout

Recommended layout:

┌─────────────────────────────────────────────────────────────────┐
│ Cyoda Ops Console   Env: dev-cloud   Status: Healthy            │
├─────────────────────────────────────────────────────────────────┤
│ Workflows | Entities | Instances | Processing | Reports | Env    │
├───────────────┬─────────────────────────────────────────────────┤
│ Runtime nav   │ Runtime detail panel                            │
└───────────────┴─────────────────────────────────────────────────┘

7.3 Workflows in Ops Console

Workflows are read-only by default.

Capabilities:

* list deployed workflows;
* open workflow in read-only viewer/editor mode;
* inspect states/transitions/criteria/processors;
* export workflow JSON;
* compare with local workflow file if a Dev project root is configured;
* create change task for Dev Console/Git.

Do not allow direct edit in MVP.

7.4 Entities and instances

Show:

* entity models;
* entity instances;
* current state;
* transition history;
* entity JSON;
* audit/history if API supports it.

7.5 Production guard

Production environments are read-only by default.

If future write actions are introduced:

* disabled unless user explicitly enables writes for current session;
* typed confirmation required;
* destructive operations require typing entity/model/workflow name;
* 5-second cooldown before execution;
* action must be logged.

MVP should avoid write actions.

7.6 Runtime change workflow

If user sees an issue in Ops Console, the preferred path is:

1. Export deployed workflow JSON.
2. Compare against local/Git workflow.
3. Generate change task.
4. Open in Dev Console or IDE.
5. Commit change via Git.
6. Deploy through normal pipeline.

Ops Console must not encourage live configuration mutation.

⸻

8. Native/Tauri command specification

8.1 Dev Console native commands

Required Tauri commands:

select_project_root(): Promise<string>
scan_project(rootPath: string, options: ScanOptions): Promise<ProjectScanResult>
read_text_file(path: string): Promise<{
  path: string;
  contents: string;
  lastModified: string;
  sizeBytes: number;
}>
write_text_file_with_confirmed_overwrite(path: string, contents: string): Promise<{
  path: string;
  lastModified: string;
  sizeBytes: number;
}>
watch_project(rootPath: string): Promise<void>
unwatch_project(rootPath: string): Promise<void>
reveal_in_finder(path: string): Promise<void>
open_in_ide(path: string, ide: "zed" | "intellij" | "vscode"): Promise<void>

Rules:

* validate paths are inside selected project root unless user explicitly selected destination via file picker;
* reject attempts to write outside allowed roots;
* no arbitrary shell commands;
* no raw command strings from frontend;
* all write operations must be explicit user actions.

8.2 Ops Console native commands

MVP may require few or no native commands beyond config storage and external open actions.

Optional:

open_url_in_browser(url: string): Promise<void>
reveal_exported_file(path: string): Promise<void>

8.3 File permissions

Project files keep existing permissions where possible.

App config files:

* parent directory: 0700
* config file: 0600

8.4 Path handling

Must support:

* macOS paths in MVP;
* future Windows/Linux path handling;
* symlinks must be resolved before write checks;
* ignore recursive symlink loops in scanner.

⸻

9. Shared UI/component strategy

Use shared UI components to make Dev and Ops feel like sibling products without coupling their domain logic.

9.1 What belongs in shared UI

console-design-system may contain:

* tokens;
* typography;
* buttons;
* panels;
* tabs;
* split panes;
* empty states;
* banners;
* badges;
* modals;
* file path display;
* copy button;
* status pills;
* confirmation dialogs.

It must not contain:

* workflow parsing;
* project scanning;
* runtime APIs;
* entity logic;
* agent logic;
* backend authentication logic.

9.2 What belongs in shell

console-shell may contain:

* app frame;
* sidebar;
* top bar;
* product switcher if needed;
* route layout;
* common keyboard shortcut help;
* app-level error boundary.

It must receive domain navigation items as props.

Example:

type ConsoleNavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  to: string;
  product: "dev" | "ops";
};

9.3 Domain packages stay separate

Dev-specific code stays in:

* workflow-file-indexer
* workflow-project-model
* workflow-editor-host
* entity-model-viewer

Ops-specific code stays in:

* cyoda-api-client
* runtime-inspection

The apps compose these packages. Shared packages must not import Dev/Ops domain packages.

⸻

10. BYO AI integration boundary

BYO AI is out of scope for this implementation spec and is covered by a separate specification.

However, the Dev Console must leave integration points:

* project root awareness;
* selected workflow context;
* selected entity/model context;
* task bundle hook;
* agent setup route/menu location if required by the separate BYO AI spec.

Manual Mode must remain possible for remote/dev-container environments where the local Tauri shell cannot write to the relevant project filesystem.

Do not implement BYO AI in this spec.

Do not remove hooks that the BYO AI spec requires.

⸻

11. Remote and dev-container constraints

The Dev Console is local-first, but users may work in:

* GitHub Codespaces;
* dev containers;
* remote SSH workspaces;
* network-mounted project directories;
* corporate machines with restricted filesystem access.

Requirements:

* If the selected folder is unavailable, show a clear error.
* If project files are remote and not accessible to Tauri, fall back to manual import/export workflows.
* Do not assume the local Tauri app can write to a remote development filesystem.
* BYO AI Manual Mode remains the fallback, handled by the separate BYO AI spec.

⸻

12. Security and safety requirements

12.1 Dev Console

* No arbitrary shell commands.
* File writes only to selected project roots or explicit save destinations.
* Confirm overwrites.
* Clean workflow serialization only.
* Do not save editor metadata into workflow JSON.
* Do not store secrets in project config.
* Do not include secrets in logs.
* Do not trust file contents.
* Handle malformed JSON without crashing.
* Guard against very deep/large workflow JSON if cyoda-workflow-editor core does not already do so.

12.2 Ops Console

* Production read-only by default.
* No direct live config edits in MVP.
* Do not store production secrets in app config unless an explicit secure-store design exists.
* Use existing Auth0/backend auth patterns where applicable.
* Never conflate runtime credentials with Dev Console local project config.

⸻

13. Testing requirements

13.1 Dev Console tests

Unit tests:

* project config schema;
* workflow file classification;
* ignored directory filtering;
* dirty-state comparison;
* clean serialization excludes metadata;
* save overwrite state machine;
* external file change detection debounce logic;
* path allowlist validation;
* entity file classification.

Integration tests:

* first-run wizard selects folder;
* scan shows valid/invalid workflows;
* opening a workflow renders editor;
* editing then saving writes clean JSON;
* overwrite warning appears;
* external edit triggers warning;
* app save does not trigger external warning;
* bad JSON shows parse error and does not crash.

13.2 Ops Console tests

Unit tests:

* connection config schema;
* production guard;
* runtime workflow export;
* read-only workflow viewer mode;
* compare workflow payloads.

Integration tests:

* connect to mock/local backend;
* list workflows;
* open workflow read-only;
* export workflow JSON;
* production write buttons absent/disabled.

13.3 Shared UI tests

* design-system primitives render;
* shell accepts nav items by props;
* no domain import cycles from shared packages.

13.4 Tauri tests

Where practical:

* Rust command unit tests;
* path normalization tests;
* symlink handling tests;
* scanner ignore tests;
* file write atomicity tests.

⸻

14. Acceptance criteria

14.1 Dev Console MVP

AC-DEV-1: App installs via Homebrew Cask and launches as a desktop app.

AC-DEV-2: First run asks user to select a Cyoda project/workflow root inside the app, not during brew install.

AC-DEV-3: App recursively discovers workflow JSON files under the selected root.

AC-DEV-4: Invalid JSON and non-workflow JSON are shown clearly and do not crash the scan.

AC-DEV-5: User can open a valid workflow in cyoda-workflow-editor.

AC-DEV-6: User can edit workflow visually and through JSON if enabled.

AC-DEV-7: User can save back to the same file only after overwrite confirmation.

AC-DEV-8: Saved file contains clean Cyoda workflow JSON only, with no layout/comments/editor metadata.

AC-DEV-9: App detects external file changes and does not confuse its own save or Monaco typing with external edits.

AC-DEV-10: User can view likely entity/model files without using a built-in code editor.

AC-DEV-11: User can reveal a file in Finder and open the project/file in an allowed external IDE.

AC-DEV-12: Remote/dev-container limitations have a graceful fallback path.

14.2 Ops Console MVP

AC-OPS-1: App installs via Homebrew Cask and launches as a desktop app.

AC-OPS-2: User can connect to local or remote Cyoda backend.

AC-OPS-3: User can list deployed workflows.

AC-OPS-4: User can view deployed workflow in read-only mode.

AC-OPS-5: User can export deployed workflow JSON.

AC-OPS-6: User can inspect entity instances and state/history where backend APIs support it.

AC-OPS-7: Production environments are read-only by default.

AC-OPS-8: No live workflow edit affordance is shown in MVP.

AC-OPS-9: Ops Console can generate or hand off a change task rather than mutating live configuration.

14.3 Shared platform

AC-SHARED-1: Dev and Ops apps use the same design tokens and shell primitives.

AC-SHARED-2: Shared UI packages do not import Dev/Ops domain logic.

AC-SHARED-3: The two apps can be built independently.

AC-SHARED-4: The two apps can share release tooling but produce separate Homebrew casks.

⸻

15. Implementation order

Phase 0: Monorepo scaffold

1. Create shared monorepo with apps/dev-console, apps/ops-console, and shared packages.
2. Add Tauri 2 scaffold for both apps.
3. Add shared design system and shell packages.
4. Set up build/test/lint commands.
5. Add signing/notarization placeholders but do not block local dev.

Phase 1: Dev Console MVP

1. First-run folder picker.
2. Project config persistence.
3. Workflow scanner.
4. Workflow file tree.
5. Workflow editor host.
6. Save/overwrite flow.
7. External file watching.
8. Entity/model lightweight viewer.
9. Open in IDE / reveal in Finder.

Phase 2: Ops Console MVP

1. Environment connection setup.
2. Backend API client.
3. Workflow list.
4. Read-only workflow view.
5. Entity/instance runtime views.
6. Export workflow JSON.
7. Production read-only guard.

Phase 3: Cross-console workflow

1. Compare deployed workflow with local file.
2. Generate change task.
3. Open local file in Dev Console.
4. Improve shared project/environment switching.

Phase 4: BYO AI integration points

Implement only the hooks needed by the separate BYO AI specification.

Do not implement BYO AI details in this spec.

⸻

16. Non-goals for MVP

* No embedded code editor.
* No embedded terminal.
* No direct production workflow editing.
* No in-app deployment pipeline.
* No general-purpose AI chat in this specification.
* No MCP server in this specification.
* No rewriting cyoda-workflow-editor.
* No replacing user IDEs.
* No browser-only companion architecture for the Dev Console MVP.

⸻

17. Questions to resolve before implementation

1. Is the monorepo new, or does it evolve from cyoda-env-dashboard?
2. What is the exact package name for the Dev Console app?
3. What is the exact package name for the Ops Console app?
4. Should Dev and Ops ship as two casks or one combined app with product switcher?
5. What local file conventions identify Cyoda workflow files more reliably than JSON parse alone?
6. What local file conventions identify entity/model files?
7. Which backend endpoints should Ops Console use for workflow list/export in each backend mode?
8. Is Auth0 required in the desktop Ops Console, or can local/go mode bypass it?
9. Which IDE integrations are required in MVP?
10. What is the first supported OS: macOS only, or macOS plus Windows/Linux?
11. Who owns signing/notarization certificates?
12. Should Dev Console support multiple workflow roots per project in MVP?
13. Should entity/model editing be read-only in MVP?

⸻

18. Final implementation instruction

Build two sibling Tauri desktop applications:

* cyoda-dev-console: local project workflow editing and review.
* cyoda-ops-console: runtime inspection and operational visibility.

Use shared UI and shell packages so the products feel consistent, but keep their domain logic separate.

Make Dev Console a thin, excellent host for cyoda-workflow-editor plus local file/project discovery. Make Ops Console a safe runtime viewer that does not mutate live configuration in MVP.

Do not implement BYO AI from this document. BYO AI is finalised separately and must be integrated only through explicit hooks.

On the UI sharing question: use a **shared design-system package plus a shared shell package**, not a shared “console app framework” that starts knowing too much about workflows, projects, environments or agents. That gives you sibling-product consistency without domain coupling.
