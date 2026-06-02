import type {
  AgentContext,
  CyodaProfile,
  TaskBundleRequest,
} from "@cyoda/agent-bridge-contract";
import {
  generateAgentTaskMd,
  generateProfileInstructionsMd,
  generateRuleFile,
  TEMPLATE_VERSION,
  type TemplateInput,
} from "./templates.js";

/** Directory (relative to the project root) the bundle is written into. */
export const BUNDLE_DIR = "cyoda-agent-task";

export interface BundleFile {
  /** Path relative to the project root. */
  relativePath: string;
  contents: string;
}

export interface BundleInputs {
  request: TaskBundleRequest;
  context: AgentContext;
  /** Selected profile (name + values), if one was chosen. */
  profile?: { name: string; profile: CyodaProfile };
  /** Already-read workflow JSON contents (caller reads the file). */
  workflowJson?: string;
  /** Already-read entity/model JSON contents (caller reads the file). */
  entitySampleJson?: string;
  /** Free-text brief, editable in the console before generation. */
  brief?: string;
}

function toRelative(absPath: string | undefined, projectRoot: string): string | undefined {
  if (!absPath) return undefined;
  if (absPath.startsWith(projectRoot)) {
    return absPath.slice(projectRoot.length).replace(/^[/\\]+/, "");
  }
  return absPath;
}

/**
 * Assemble the task-bundle file list (BYO_AI-spec §19). Pure: the caller writes the
 * returned files. Throws if a provided profile name/endpoint is unsafe.
 */
export function assembleBundle(inputs: BundleInputs): BundleFile[] {
  const { request, context, profile } = inputs;
  const ruleFile = request.agentRuleFile;

  const workflowRel = toRelative(context.selectedWorkflowPath, context.projectRoot);
  const entityRel = toRelative(context.selectedEntityPath, context.projectRoot);
  const templateInput: TemplateInput = {
    projectRoot: context.projectRoot,
    ...(workflowRel ? { workflowRelPath: workflowRel } : {}),
    ...(entityRel ? { entityRelPath: entityRel } : {}),
    ...(profile
      ? { profileName: profile.name, endpoint: profile.profile.endpoint, env: profile.profile.env }
      : {}),
    ...(inputs.brief ? { brief: inputs.brief } : {}),
  };

  const includeWorkflow = request.includeWorkflowJson === true && inputs.workflowJson !== undefined;
  const includeEntity =
    request.includeEntitySampleJson === true && inputs.entitySampleJson !== undefined;

  const files: BundleFile[] = [
    {
      relativePath: `${BUNDLE_DIR}/cyoda-agent-task.md`,
      contents: generateAgentTaskMd(templateInput, ruleFile),
    },
    {
      relativePath: `${BUNDLE_DIR}/${ruleFile}`,
      contents: generateRuleFile(ruleFile, templateInput),
    },
    {
      relativePath: `${BUNDLE_DIR}/profile-instructions.md`,
      contents: generateProfileInstructionsMd(templateInput),
    },
  ];

  if (includeWorkflow) {
    files.push({ relativePath: `${BUNDLE_DIR}/workflow.json`, contents: inputs.workflowJson! });
  }
  if (includeEntity) {
    files.push({
      relativePath: `${BUNDLE_DIR}/entity-sample.json`,
      contents: inputs.entitySampleJson!,
    });
  }

  const manifest = {
    version: "1",
    createdAt: new Date().toISOString(),
    ruleFile,
    workflowJsonIncluded: includeWorkflow,
    entitySampleJsonIncluded: includeEntity,
    ...(profile ? { cyodaProfile: profile.name } : {}),
    templateVersion: TEMPLATE_VERSION,
  };
  files.push({
    relativePath: `${BUNDLE_DIR}/MANIFEST.json`,
    contents: JSON.stringify(manifest, null, 2) + "\n",
  });

  return files;
}
