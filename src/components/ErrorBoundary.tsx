import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches render-phase throws (e.g. a degenerate STL reaching three.js, a
 * TransformControls edge) so they degrade to a recoverable panel instead of
 * white-screening the whole app. react-three-fiber re-throws scene-graph errors
 * into the host tree specifically so a boundary like this can catch them.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[vibemesh-ai] render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash-screen" role="alert">
          <div className="crash-card">
            <h2>Something went wrong</h2>
            <p>The 3D view hit an error. Your projects are saved — reloading usually fixes it.</p>
            <pre>{this.state.error.message}</pre>
            <button className="send-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
