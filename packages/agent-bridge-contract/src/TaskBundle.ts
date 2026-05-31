/**
 * Inputs the Bundle generator needs. See docs/BYO_AI-spec.md §17.5.
 * The actual generator is implemented in a future BYO AI plan, NOT here.
 */
export type TaskBundleRequest = {
  targetProjectPath: string;
  agentRuleFile: "AGENTS.md" | "CLAUDE.md" | "GEMINI.md" | ".cursorrules" | ".clinerules";
  includeWorkflowJson?: boolean;
  includeEntitySampleJson?: boolean;
  cyodaProfile?: string;
  consoleEnvironment: "development" | "production";
  apiBaseUrl: string;
};

/**
 * Output manifest for one generated bundle.
 */
export type TaskBundleResult = {
  zipPath: string;
  manifest: {
    version: string;
    createdAt: string;
    ruleFile: TaskBundleRequest["agentRuleFile"];
    workflowJsonIncluded: boolean;
    entitySampleJsonIncluded: boolean;
    cyodaProfile?: string;
  };
};
