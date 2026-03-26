/**
 * AppTrack Extension Popup
 * Main application component with state management and job form
 */

import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from "react";
import type { ExtensionState, JobData, ApplicationPayload, JobFitStatus, JobFitResult } from "@/shared/types";
import { messages } from "@/shared/utils/messaging";
import { STORAGE_KEYS, APP_URL } from "@/shared/constants";
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
  previousView: ExtensionState | null;
  loading: boolean;
  jobData: JobData | null;
  error: string | null;
  savedId: string | null;
  wasQueued: boolean;
  fullSiteAccess: boolean;
  autoAnalysis: boolean;
  jobFitStatus: JobFitStatus;
  jobFitResult?: JobFitResult;
}

function AppContent() {
  const [state, setState] = useState<AppState>({
    view: "logged_out",
    previousView: null,
    loading: true,
    jobData: null,
    error: null,
    savedId: null,
    wasQueued: false,
    fullSiteAccess: false,
    autoAnalysis: true,
    jobFitStatus: "idle",
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

      // Load full-site access status
      const fullSiteAccess = await messages.getFullSiteStatus();

      // Load settings (for autoAnalysis)
      const settings = await chrome.storage.local.get("apptrack_settings");
      const autoAnalysis = (settings["apptrack_settings"] as { autoAnalysis?: boolean } | null)?.autoAnalysis ?? true;

      // Fetch job data from current tab
      const jobResult = await messages.getJobData();

      if (!jobResult.success || !jobResult.data) {
        setState((s) => ({ ...s, view: "no_job", fullSiteAccess, autoAnalysis, loading: false }));
        return;
      }

      const jobData = jobResult.data;
      const hasJob = !!(jobData.title || jobData.company);

      if (!hasJob) {
        setState((s) => ({ ...s, view: "no_job", fullSiteAccess, autoAnalysis, loading: false }));
        return;
      }

      // Load job fit state
      const jobFitData = await messages.getJobFit();

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
          fullSiteAccess,
          autoAnalysis,
          jobFitStatus: jobFitData.status,
          jobFitResult: jobFitData.result,
          loading: false,
        }));
        return;
      }

      // Job detected and not tracked
      setState((s) => ({
        ...s,
        view: "job_detected",
        jobData,
        fullSiteAccess,
        autoAnalysis,
        jobFitStatus: jobFitData.status,
        jobFitResult: jobFitData.result,
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
    void initialize();
  }, [initialize]);

  // Listen for auth state changes (e.g., after user signs in from web app)
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local" && changes[STORAGE_KEYS.AUTH_STATE]) {
        // Auth state changed, re-initialize
        void initialize();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [initialize]);

  // Poll for job fit updates while analysis is loading
  useEffect(() => {
    if (state.jobFitStatus !== "loading") return;

    const interval = setInterval(async () => {
      const jobFitData = await messages.getJobFit();
      if (jobFitData.status !== "loading") {
        setState((s) => ({
          ...s,
          jobFitStatus: jobFitData.status,
          jobFitResult: jobFitData.result,
        }));
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [state.jobFitStatus]);

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

  // Open settings view
  const handleOpenSettings = useCallback(() => {
    setState((s) => ({ ...s, previousView: s.view, view: "settings" }));
  }, []);

  // Close settings view, return to previous
  const handleCloseSettings = useCallback(() => {
    setState((s) => ({ ...s, view: s.previousView ?? "no_job", previousView: null }));
  }, []);

  // Toggle auto-analysis setting
  const handleToggleAutoAnalysis = useCallback(async (enable: boolean) => {
    // Use chrome.storage directly for simplicity (storage.setSettings merges)
    const stored = await chrome.storage.local.get("apptrack_settings");
    const current = (stored["apptrack_settings"] as Record<string, unknown>) ?? {};
    await chrome.storage.local.set({ apptrack_settings: { ...current, autoAnalysis: enable } });
    setState((s) => ({ ...s, autoAnalysis: enable }));
  }, []);

  // Toggle full-site access
  const handleToggleFullSite = useCallback(async (enable: boolean) => {
    if (enable) {
      const result = await messages.enableFullSiteAccess();
      if (result.success) {
        setState((s) => ({ ...s, fullSiteAccess: true }));
      }
    } else {
      const result = await messages.disableFullSiteAccess();
      if (result.success) {
        setState((s) => ({ ...s, fullSiteAccess: false }));
      } else {
        // Reconcile with actual permission state if disable failed
        const actual = await messages.getFullSiteStatus();
        setState((s) => ({ ...s, fullSiteAccess: actual }));
      }
    }
  }, []);

  // Loading state
  if (state.loading && state.view === "logged_out") {
    return (
      <div className="w-80 p-4 flex items-center justify-center min-h-[120px]">
        <div className="animate-spin h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const showSettingsButton = state.view !== "logged_out" && state.view !== "settings";

  // Render based on view state
  return (
    <div className="w-80">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Header
              showLogout={state.view !== "logged_out"}
              onLogout={handleLogout}
            />
          </div>
          {showSettingsButton && (
            <button
              onClick={handleOpenSettings}
              className="ml-2 p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>

        {state.view === "logged_out" && <LoggedOutView />}
        {state.view === "no_job" && <NoJobView />}
        {state.view === "job_detected" && state.jobData && (
          <JobDetectedView
            jobData={state.jobData}
            loading={state.loading}
            error={state.error}
            onSave={handleSave}
            onUpdate={updateJobData}
            jobFitStatus={state.jobFitStatus}
            jobFitResult={state.jobFitResult}
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
        {state.view === "settings" && (
          <SettingsView
            fullSiteAccess={state.fullSiteAccess}
            onToggleFullSite={handleToggleFullSite}
            onBack={handleCloseSettings}
            autoAnalysis={state.autoAnalysis}
            onToggleAutoAnalysis={handleToggleAutoAnalysis}
          />
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
    const callbackUrl = new URL(`${APP_URL}/auth/extension-callback`);
    callbackUrl.searchParams.set("extensionId", extensionId);
    void chrome.tabs.create({ url: callbackUrl.toString() });
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
        Don&apos;t have an account?{" "}
        <button
          onClick={() => chrome.tabs.create({ url: `${APP_URL}/signup` })}
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
          onClick={() => chrome.tabs.create({ url: `${APP_URL}/dashboard` })}
          className="text-brand-500"
        >
          <ExternalLinkIcon className="w-4 h-4 mr-1.5" />
          View Dashboard
        </Button>
      </div>
    </div>
  );
}

interface JobFitSectionProps {
  status: JobFitStatus;
  result?: JobFitResult;
}

function JobFitSection({ status, result }: JobFitSectionProps) {
  if (status === "idle") return null;

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
      <p className="text-xs font-medium text-gray-500 mb-2">Job Fit</p>

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="animate-spin h-3 w-3 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span>Analyzing your fit...</span>
        </div>
      )}

      {status === "ready" && result && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-lg font-bold ${
                result.overallScore >= 80 ? "text-green-600" :
                result.overallScore >= 60 ? "text-yellow-600" :
                "text-gray-500"
              }`}
            >
              {result.overallScore}
            </span>
            <span className="text-xs text-gray-400">/ 100</span>
          </div>
          <p className="text-xs text-gray-600 leading-snug">{result.summary}</p>
          <button
            type="button"
            onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/dashboard/ai-coach" })}
            className="text-xs text-brand-500 hover:text-brand-600 mt-1 flex items-center gap-1"
          >
            Run with a different resume
            <ExternalLinkIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      {status === "no_resume" && (
        <div>
          <p className="text-xs text-gray-600">Upload your resume to see your fit score.</p>
          <button
            type="button"
            onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/dashboard/resumes" })}
            className="text-xs text-brand-500 hover:text-brand-600 mt-1"
          >
            Upload resume →
          </button>
        </div>
      )}

      {status === "upgrade_required" && (
        <div>
          <p className="text-xs text-gray-600 mb-1">Upgrade to Pro to see your fit score.</p>
          <button
            type="button"
            onClick={() => chrome.tabs.create({ url: "https://apptrack.ing/dashboard/upgrade" })}
            className="text-xs text-brand-500 hover:text-brand-600"
          >
            Upgrade to Pro →
          </button>
        </div>
      )}

      {status === "error" && (
        <p className="text-xs text-gray-400">Analysis unavailable.</p>
      )}
    </div>
  );
}

interface JobDetectedViewProps {
  jobData: JobData;
  loading: boolean;
  error: string | null;
  onSave: (data: ApplicationPayload) => void;
  onUpdate: (updates: Partial<JobData>) => void;
  jobFitStatus: JobFitStatus;
  jobFitResult?: JobFitResult;
}

function JobDetectedView({
  jobData,
  loading,
  error,
  onSave,
  onUpdate,
  jobFitStatus,
  jobFitResult,
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

      {/* Job Fit Section */}
      <JobFitSection status={jobFitStatus} result={jobFitResult} />

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
        onClick={() => chrome.tabs.create({ url: `${APP_URL}/dashboard` })}
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
        onClick={() => chrome.tabs.create({ url: `${APP_URL}/dashboard` })}
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

interface SettingsViewProps {
  fullSiteAccess: boolean;
  onToggleFullSite: (enable: boolean) => Promise<void>;
  onBack: () => void;
  autoAnalysis: boolean;
  onToggleAutoAnalysis: (enable: boolean) => Promise<void>;
}

function SettingsView({ fullSiteAccess, onToggleFullSite, onBack, autoAnalysis, onToggleAutoAnalysis }: SettingsViewProps) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggleFullSite(!fullSiteAccess);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="py-2">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          title="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-gray-900">Settings</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 py-3 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Enable on all websites</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Detect job postings on any site, including company career pages not on the default list.
              Chrome will ask for permission when you turn this on.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none ${
              fullSiteAccess ? "bg-brand-500" : "bg-gray-200"
            } ${toggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            role="switch"
            aria-checked={fullSiteAccess}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                fullSiteAccess ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex items-start justify-between gap-3 py-3 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Auto-analyze job fit</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatically show your fit score when you land on a job listing. Pro feature.
            </p>
          </div>
          <button
            onClick={() => onToggleAutoAnalysis(!autoAnalysis)}
            className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none ${
              autoAnalysis ? "bg-brand-500" : "bg-gray-200"
            } cursor-pointer`}
            role="switch"
            aria-checked={autoAnalysis}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                autoAnalysis ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="pt-1">
          <p className="text-xs text-gray-400">
            Default list covers LinkedIn, Indeed, Greenhouse, Lever, Workday, and 20+ other job boards.
          </p>
        </div>
      </div>
    </div>
  );
}
