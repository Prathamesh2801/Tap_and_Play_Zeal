import { Component } from 'react'

/**
 * A screen mounted on a wall must never show a white page. Any render error is
 * caught here and turned into a recoverable state.
 */
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[tap&play] render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="surface hairline w-full max-w-sm rounded-2xl p-7 text-center">
          <p className="text-[17px] font-medium text-ink-050">Something broke</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 h-11 w-full rounded-xl bg-ink-050 text-sm font-medium text-ink-950 transition-colors hover:bg-white"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
