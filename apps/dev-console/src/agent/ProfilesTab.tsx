import { useQuery } from "@tanstack/react-query";
import { EmptyState, useTokens } from "@cyoda/console-design-system";
import { readCyodaProfileConfig } from "../ipc/agent.js";
import { parseProfileConfig, jwtStatus, type TokenStatus } from "./profiles.js";

export function ProfilesTab() {
  const t = useTokens();
  const q = useQuery({
    queryKey: ["cyoda-profiles"],
    queryFn: async () => parseProfileConfig(await readCyodaProfileConfig()),
  });

  if (q.isPending) {
    return <div style={{ padding: t.space.lg, fontFamily: t.font.sans }}>Loading…</div>;
  }

  const profileSet = q.data;
  if (!profileSet || Object.keys(profileSet.profiles).length === 0) {
    return (
      <EmptyState
        title="No Cyoda profiles found"
        description="Create ~/.config/cyoda/cyoda-plugin-config.json with an active profile (endpoint, env, token). The Bundle tab includes setup instructions, and the cyoda-skills 'setup' / 'auth' skills cover it in full."
      />
    );
  }

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "6px 10px",
    borderBottom: `1px solid ${t.color.border}`,
    fontSize: t.font.sizes.sm,
    color: t.color.textMuted,
    fontWeight: 600,
  };
  const td: React.CSSProperties = {
    padding: "6px 10px",
    borderBottom: `1px solid ${t.color.border}`,
    fontSize: t.font.sizes.sm,
    fontFamily: t.font.sans,
  };

  return (
    <div style={{ padding: t.space.lg }}>
      <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted, marginTop: 0 }}>
        Read-only view of <code style={{ fontFamily: t.font.mono }}>~/.config/cyoda/cyoda-plugin-config.json</code>.
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 760 }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Endpoint</th>
            <th style={th}>Env</th>
            <th style={th}>Token</th>
            <th style={th}>Active</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(profileSet.profiles).map(([name, p]) => (
            <tr key={name}>
              <td style={{ ...td, fontWeight: 600 }}>{name}</td>
              <td style={{ ...td, fontFamily: t.font.mono, color: t.color.textMuted }}>
                {p.endpoint || "—"}
              </td>
              <td style={td}>
                <EnvBadge env={p.env} />
              </td>
              <td style={td}>
                <TokenBadge status={jwtStatus(p.token)} />
              </td>
              <td style={td}>{profileSet.active === name ? "●" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvBadge({ env }: { env: "development" | "production" }) {
  const t = useTokens();
  const bg = env === "production" ? t.color.cyodaOrange : t.color.success;
  return (
    <span style={{ background: bg, color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 11 }}>
      {env}
    </span>
  );
}

function TokenBadge({ status }: { status: TokenStatus }) {
  const t = useTokens();
  const color =
    status === "valid" ? t.color.success : status === "expired" ? t.color.danger : t.color.textMuted;
  return <span style={{ color, fontWeight: 600 }}>{status}</span>;
}
