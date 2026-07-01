import { Component } from "react";

// Catches render-time errors anywhere below it and shows a recoverable fallback
// instead of unmounting the whole app to a blank screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <div className="error-card">
            <h1>Something went wrong</h1>
            <p>An unexpected error occurred while rendering this page.</p>
            {this.state.error?.message && (
              <pre className="error-detail">{String(this.state.error.message)}</pre>
            )}
            <button className="error-btn" onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
