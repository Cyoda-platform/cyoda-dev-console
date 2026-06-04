import { Component, type ReactNode } from "react";

interface Props {
  onReset?: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          fontFamily: "'Inter', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#DA1E28" }}>
            Something went wrong rendering this file.
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12,
            color: "#525252",
            background: "#F4F4F4",
            padding: 12,
            borderRadius: 2,
            maxHeight: 120,
            overflow: "auto",
          }}>
            {this.state.error.message}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "1px solid #E0E0E0",
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              color: "#525252",
              padding: "4px 12px",
            }}
          >
            ← Close file
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
