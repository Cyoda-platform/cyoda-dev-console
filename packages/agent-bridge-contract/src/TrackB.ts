/** Capability manifest returned by GET /v1/capabilities (see BYO_AI-spec §17.4). */
export type TrackBCapabilityManifest = {
  version: string;
  platform: string;
  capabilities: {
    "profiles.read": boolean;
    "profiles.write": boolean;
    "profiles.active.write": boolean;
    "agents.claude-code.install": boolean;
    "agents.gemini-cli.install": boolean;
    "agents.codex.install": boolean;
    "agents.cursor.install": boolean;
    "projects.bundle.write": boolean;
    "keychain.store-client-secret": boolean;
  };
};

export type CyodaProfile = {
  endpoint: string;
  env: "development" | "production";
  token: string;
};

export type ProfileSet = {
  active: string;
  profiles: Record<string, CyodaProfile>;
};

/**
 * Thin interface hiding HTTP (companion) vs IPC (desktop shell) implementations.
 * No implementation lives in this package — see BYO_AI-spec.md line 362.
 */
export interface TrackBClient {
  pair(input: { pairingCode: string }): Promise<{ token: string }>;
  getCapabilities(): Promise<TrackBCapabilityManifest>;
  getProfiles(): Promise<ProfileSet>;
  agentStatus(agent: string): Promise<{ installed: boolean; version?: string }>;
  installAgent(agent: string): Promise<void>;
  launchAgent(agent: string, options: { cwd: string }): Promise<void>;
  writeBundle(input: { projectPath: string; bundleZipBase64: string }): Promise<void>;
  switchProfile(name: string): Promise<void>;
  confirmAction(input: { action: string; prodOverride?: boolean }): Promise<{ nonce: string }>;
}
