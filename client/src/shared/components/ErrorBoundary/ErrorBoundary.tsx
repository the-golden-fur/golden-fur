import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render-time exceptions anywhere below it in the tree. React only
 * supports this via a class component's static getDerivedStateFromError /
 * componentDidCatch lifecycle - there is no hook equivalent.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.boundary} role="alert">
          <p className={styles.code}>500</p>
          <p className={styles.title}>Something went wrong</p>
          <p className={styles.copy}>
            This part of the page hit an unexpected error.
          </p>
          <p className={styles.errorCode}>Error code: SERVER_ERROR</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={this.handleReset}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
