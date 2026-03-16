/**
 * AppTrack Extension Popup
 * Main application component with state management and job form
 */

import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from "react";
import type { ExtensionState, JobData, ApplicationPayload } from "@/shared/types";
import { messages } from "@/shared/utils/messaging";
import { STORAGE_KEYS } from "@/shared/constants";
import {
  Button,
  Input,
  Header,
  SearchIcon,
  CheckCircleIcon,
  ExclamationIcon,
  ErrorIcon,
  BriefcaseIcon,
  CloudOfflineIcon,
  ExternalLinkIcon,
} from "./components";

// ============================================================================
// Error Boundary
// ============================================================================

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
            <ErrorIcon className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-gray-900 font-medium">Something went wrong</p>
          <p className="text-gray-500 text-sm mt-1">{this.state.error?.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            className="mt-3"
          >
            Reload extension
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Main App Component
// ============================================================================

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

// ============================================================================
// App Content with State Management
// ============================================================================

interface AppState {
  view: ExtensionState;
  loading: boolean;
  jobData: JobData | null;
  error: string | null;
  savedId: string | null;
  wasQueued: boolean;
}

function AppContent() {
  const [state, setState] = useState<AppState>({
    view: "logged_out",
    loading: true,
    jobData: null,
    error: null,
    savedId: null,
    wasQueued: false,
  });

  // Guard to prevent concurrent initialization calls
  const isInitializing = useRef(false);

  // Initialize function - check auth and fetch job data
  const initialize = useCallback(async () => {
    // Prevent race condition from concurrent calls
    if (isInitializing.current) {
      return;
    }
    isInitializing.current = true;

    try {
      setState((s) => ({ ...s, loading: true }));

      // Check auth state
      const authState = await messages.getAuthState();

      if (!authState.isAuthenticated) {
        setState((s) => ({ ...s, view: "logged_out", loading: false }));
        return;
      }

      // Fetch job data from current tab
      const jobResult = await messages.getJobData();

      if (!jobResult.success || !jobResult.data) {
        setState((s) => ({ ...s, view: "no_job", loading: false }));
        return;
      }

      const jobData = jobResult.data;
      const hasJob = !!(jobData.title || jobData.company);

      if (!hasJob) {
        setState((s) => ({ ...s, view: "no_job", loading: false }));
        return;
      }

      // Check if already tracked
      const duplicateResult = await messages.checkDuplicate(
        jobData.company ?? "",
        jobData.title ?? ""
      );

      if (duplicateResult.success && duplicateResult.exists) {
        setState((s) => ({
          ...s,
          view: "already_tracked",
          jobData,
          loading: false,
        }));
        return;
      }

      // Job detected and not tracked
      setState((s) => ({
        ...s,
        view: "job_detected",
        jobData,
        loading: false,
      }));
    } catch (error) {
      console.error("[AppTrack] Initialization error:", error);
      setState((s) => ({
        ...s,
        view: "error",
        error: error instanceof Error ? error.message : "Failed to initialize",
        loading: false,
      }));
    } finally {
      isInitializing.current = false;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Listen for auth state changes (e.g., after user signs in from web app)
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local" && changes[STORAGE_KEYS.AUTH_STATE]) {
        // Auth state changed, re-initialize
        initialize();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [initialize]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await messages.logout();
    setState((s) => ({ ...s, view: "logged_out", jobData: null }));
  }, []);

  // Handle save
  const handleSave = useCallback(async (data: ApplicationPayload) => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const result = await messages.saveApplication(data);

      if (!result.success) {
        setState((s) => ({
          ...s,
          loading: false,
          error: result.error ?? "Failed to save application",
        }));
        return;
      }

      setState((s) => ({
        ...s,
        view: "success",
        savedId: result.id ?? null,
        wasQueued: result.queued ?? false,
        loading: false,
      }));
    } catch (error) {
      console.error("[AppTrack] Save error:", error);
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to save",
      }));
    }
  }, []);

  // Update job data (for form edits)
  const updateJobData = useCallback((updates: Partial<JobData>) => {
    setState((s) => ({
      ...s,
      jobData: s.jobData ? { ...s.jobData, ...updates } : null,
    }));
  }, []);

  // Reset to try again
  const handleReset = useCallback(() => {
    window.location.reload();
  }, []);

  // Loading state
  if (state.loading && state.view === "logged_out") {
    return (
      <div className="w-80 p-4 flex items-center justify-center min-h-[120px]">
        <div className="animate-spin h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Render based on view state
  return (
    <div className="w-80">
      <div className="p-4">
        <Header
          showLogout={state.view !== "logged_out"}
          onLogout={handleLogout}
        />

        {state.view === "logged_out" && <LoggedOutView />}
        {state.view === "no_job" && <NoJobView />}
        {state.view === "job_detected" && state.jobData && (
          <JobDetectedView
            jobData={state.jobData}
            loading={state.loading}
            error={state.error}
            onSave={handleSave}
            onUpdate={updateJobData}
          />
        )}
        {state.view === "already_tracked" && state.jobData && (
          <AlreadyTrackedView jobData={state.jobData} />
        )}
        {state.view === "success" && (
          <SuccessView wasQueued={state.wasQueued} />
        )}
        {state.view === "error" && (
          <ErrorView message={state.error} onRetry={handleReset} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// View Components
// ============================================================================

function LoggedOutView() {
  const handleLogin = () => {
    // Get the extension ID and pass it to the callback page
    const extensionId = chrome.runtime.id;
    const callbackUrl = new URL("https://apptrack.ing/auth/extension-callback");
    callbackUrl.searchParams.set("extensionId", extensionId);
    chrome.tabs.create({ url: callbackUrl.toString() });
  };

  return (
    <div className="text-center py-4">
      <div className="text-brand-500 mb-4">
        <BriefcaseIcon className="w-16 h-16 mx-auto" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Track Your Applications
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        Sign in to save job postings with one click and track your progress.
      </p>
      <Button onClick={handleLogin} className="w-full">
        Sign in to AppTrack
      </Button>
      <p className="text-xs text-gray-400 mt-4">
        Don't have an account?{" "}
        <button
          onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/signup" })}
          className="text-brand-500 hover:text-brand-600"
        >
          Sign up free
        </button>
      </p>
    </div>
  );
}

function NoJobView() {
  return (
    <div className="text-center py-6">
      <div className="text-gray-300 mb-3">
        <SearchIcon className="w-14 h-14 mx-auto" />
      </div>
      <h2 className="text-base font-medium text-gray-700 mb-1">
        No job posting detected
      </h2>
      <p className="text-gray-400 text-sm">
        Navigate to a job listing page to save it
      </p>
      <div className="mt-6 pt-4 border-t border-gray-100">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/dashboard" })}
          className="text-brand-500"
        >
          <ExternalLinkIcon className="w-4 h-4 mr-1.5" />
          View Dashboard
        </Button>
      </div>
    </div>
  );
}

interface JobDetectedViewProps {
  jobData: JobData;
  loading: boolean;
  error: string | null;
  onSave: (data: ApplicationPayload) => void;
  onUpdate: (updates: Partial<JobData>) => void;
}

function JobDetectedView({
  jobData,
  loading,
  error,
  onSave,
  onUpdate,
}: JobDetectedViewProps) {
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!jobData.title || !jobData.company) {
      return;
    }

    onSave({
      jobTitle: jobData.title,
      company: jobData.company,
      jobUrl: jobData.url,
      description: jobData.description ?? undefined,
      location: jobData.location ?? undefined,
      salary: jobData.salary ?? undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
        <div className="flex-shrink-0 w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
          <BriefcaseIcon className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {jobData.title ?? "Job Title"}
          </h2>
          <p className="text-sm text-gray-500 truncate">
            {jobData.company ?? "Company"}
          </p>
        </div>
      </div>

      {/* Basic Fields */}
      <Input
        label="Job Title"
        value={jobData.title ?? ""}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="e.g. Software Engineer"
        required
      />

      <Input
        label="Company"
        value={jobData.company ?? ""}
        onChange={(e) => onUpdate({ company: e.target.value })}
        placeholder="e.g. Acme Corp"
        required
      />

      {/* Optional Fields Toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        {expanded ? "Less details" : "More details"}
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          <Input
            label="Location"
            value={jobData.location ?? ""}
            onChange={(e) => onUpdate({ location: e.target.value })}
            placeholder="e.g. San Francisco, CA (Remote)"
          />

          <Input
            label="Salary"
            value={jobData.salary ?? ""}
            onChange={(e) => onUpdate({ salary: e.target.value })}
            placeholder="e.g. $120k - $150k"
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button type="submit" loading={loading} disabled={loading} className="w-full">
        {loading ? "Saving..." : "Save Application"}
      </Button>
    </form>
  );
}

interface AlreadyTrackedViewProps {
  jobData: JobData;
}

function AlreadyTrackedView({ jobData }: AlreadyTrackedViewProps) {
  return (
    <div className="text-center py-4">
      <div className="text-yellow-500 mb-3">
        <ExclamationIcon className="w-12 h-12 mx-auto" />
      </div>
      <h2 className="text-base font-medium text-gray-900 mb-1">
        Already Tracking
      </h2>
      <p className="text-gray-500 text-sm mb-1">
        {jobData.title ?? "This job"} at {jobData.company ?? "this company"}
      </p>
      <p className="text-gray-400 text-xs mb-4">
        is already in your applications
      </p>
      <Button
        variant="secondary"
        onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/dashboard" })}
        className="w-full"
      >
        <ExternalLinkIcon className="w-4 h-4 mr-1.5" />
        View in Dashboard
      </Button>
    </div>
  );
}

interface SuccessViewProps {
  wasQueued: boolean;
}

function SuccessView({ wasQueued }: SuccessViewProps) {
  return (
    <div className="text-center py-4">
      <div className="text-green-500 mb-3">
        <CheckCircleIcon className="w-14 h-14 mx-auto" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Application Saved!
      </h2>
      {wasQueued ? (
        <div className="flex items-center justify-center gap-1.5 text-amber-600 text-sm mb-4">
          <CloudOfflineIcon className="w-4 h-4" />
          <span>Queued for sync when online</span>
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-4">
          Added to your job tracker
        </p>
      )}
      <Button
        onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/dashboard" })}
        className="w-full"
      >
        <ExternalLinkIcon className="w-4 h-4 mr-1.5" />
        View Dashboard
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.close()}
        className="w-full mt-2"
      >
        Close
      </Button>
    </div>
  );
}

interface ErrorViewProps {
  message: string | null;
  onRetry: () => void;
}

function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <div className="text-center py-4">
      <div className="text-red-500 mb-3">
        <ErrorIcon className="w-12 h-12 mx-auto" />
      </div>
      <h2 className="text-base font-medium text-gray-900 mb-1">
        Connection Error
      </h2>
      <p className="text-gray-500 text-sm mb-4">
        {message ?? "Unable to connect to extension"}
      </p>
      <Button variant="secondary" onClick={onRetry} className="w-full">
        Try Again
      </Button>
    </div>
  );
}
