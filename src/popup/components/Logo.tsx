/**
 * AppTrack Logo component
 */

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizes = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-10 h-10",
};

const textSizes = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

export function Logo({ size = "md", showText = true }: LogoProps) {
  return (
    <div className="flex items-center gap-2">
      <svg
        className={sizes[size]}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="48" height="48" rx="10" className="fill-brand-500" />
        <path
          d="M14 24h20M24 14v20"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {showText && (
        <span className={`font-semibold text-gray-900 ${textSizes[size]}`}>
          AppTrack
        </span>
      )}
    </div>
  );
}

/**
 * Header component with logo
 */
interface HeaderProps {
  showLogout?: boolean;
  onLogout?: () => void;
}

export function Header({ showLogout, onLogout }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
      <Logo size="md" />
      {showLogout && (
        <button
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      )}
    </header>
  );
}
