/**
 * Snapshot of the console state that an agent (in any future track) needs to act on
 * behalf of the developer. This is purely descriptive: how the data is gathered or
 * delivered is decided by the agent integration plan.
 */
export type AgentContext = {
  /** Absolute path to the active project root, from workflow-project-model. */
  projectRoot: string;
  /** Absolute path to the workflow file currently open in the editor, if any. */
  selectedWorkflowPath?: string;
  /** Absolute path to the entity/model file currently open in the viewer, if any. */
  selectedEntityPath?: string;
};
