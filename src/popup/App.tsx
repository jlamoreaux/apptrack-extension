import { useState, useEffect, Component, type ReactNode } from "react";
import type { ExtensionState } from "@/shared/types";

// Error Boundary for graceful error handling
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-80 p-4 text-center">
          <div className="text-red-500 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">Something went wrong</p>
          <p className="text-gray-500 text-sm mt-1">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-blue-500 hover:text-blue-600 text-sm"
          >
            Reload extension
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [state, setState] = useState<ExtensionState>("logged_out");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check auth state on mount
    chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" }, (response) => {
      // Check for Chrome runtime errors
      if (chrome.runtime.lastError) {
        console.error("[AppTrack] Message error:", chrome.runtime.lastError.message);
        setErrorMessage(chrome.runtime.lastError.message ?? "Failed to connect");
        setState("error");
        setLoading(false);
        return;
      }

      if (response?.isAuthenticated) {
        setState("no_job");
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="w-80 p-4 flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-80 p-4">
      <header className="flex items-center gap-2 mb-4">
        <img src="/icons/icon-48.svg" alt="AppTrack" className="w-8 h-8" />
        <h1 className="text-lg font-semibold text-gray-900">AppTrack</h1>
      </header>

      {state === "logged_out" && <LoggedOutView />}
      {state === "no_job" && <NoJobView />}
      {state === "job_detected" && <JobDetectedView />}
      {state === "already_tracked" && <AlreadyTrackedView />}
      {state === "success" && <SuccessView />}
      {state === "error" && <ErrorView message={errorMessage} />}
    </div>
  );
}

function LoggedOutView() {
  const handleLogin = () => {
    chrome.tabs.create({ url: "https://apptrack.ing/auth/extension" });
  };

  return (
    <div className="text-center">
      <p className="text-gray-600 mb-4">Sign in to start tracking your job applications</p>
      <button
        onClick={handleLogin}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
      >
        Sign in to AppTrack
      </button>
    </div>
  );
}

function NoJobView() {
  return (
    <div className="text-center">
      <div className="text-gray-400 mb-2">
        <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-gray-600">No job posting detected on this page</p>
      <p className="text-gray-400 text-sm mt-1">Navigate to a job listing to save it</p>
    </div>
  );
}

function JobDetectedView() {
  const handleSave = () => {
    // TODO: Implement save via background script
    chrome.runtime.sendMessage({ type: "SAVE_APPLICATION" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[AppTrack] Save error:", chrome.runtime.lastError.message);
      }
    });
  };

  return (
    <div>
      <p className="text-gray-600 mb-4">Job posting detected!</p>
      {/* TODO: Show extracted job data and save form */}
      <button
        onClick={handleSave}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
      >
        Save Application
      </button>
    </div>
  );
}

function AlreadyTrackedView() {
  const handleViewDashboard = () => {
    chrome.tabs.create({ url: "https://apptrack.ing/dashboard" });
  };

  return (
    <div className="text-center">
      <div className="text-yellow-500 mb-2">
        <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-gray-600">You're already tracking this job</p>
      <button
        onClick={handleViewDashboard}
        className="text-blue-500 hover:text-blue-600 text-sm mt-2"
      >
        View in dashboard
      </button>
    </div>
  );
}

function SuccessView() {
  const handleViewDashboard = () => {
    chrome.tabs.create({ url: "https://apptrack.ing/dashboard" });
  };

  return (
    <div className="text-center">
      <div className="text-green-500 mb-2">
        <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-gray-900 font-medium">Application saved!</p>
      <button
        onClick={handleViewDashboard}
        className="text-blue-500 hover:text-blue-600 text-sm mt-2"
      >
        View in dashboard
      </button>
    </div>
  );
}

function ErrorView({ message }: { message: string | null }) {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="text-center">
      <div className="text-red-500 mb-2">
        <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-gray-900 font-medium">Connection error</p>
      <p className="text-gray-500 text-sm mt-1">{message ?? "Unable to connect to extension"}</p>
      <button
        onClick={handleRetry}
        className="mt-3 text-blue-500 hover:text-blue-600 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
