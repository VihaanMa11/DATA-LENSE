import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface the error in the console for debugging instead of blanking the screen.
    console.error("Page render error:", error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, background: "#fff", border: "1px solid #C00000", borderRadius: 8, margin: 24 }}>
          <h2 style={{ color: "#C00000", marginTop: 0 }}>This page hit an error</h2>
          <p style={{ color: "#444" }}>{String(this.state.error?.message || this.state.error)}</p>
          <pre style={{ background: "#F8F9FA", padding: 12, borderRadius: 6, overflowX: "auto", fontSize: 12, color: "#666" }}>
            {String(this.state.error?.stack || "").split("\n").slice(0, 6).join("\n")}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
