/**
 * AppTrack Logo component
 */
import browser from "webextension-polyfill";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const imgSizes = {
  sm: 24,
  md: 32,
  lg: 40,
};

const textSizes = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

export function Logo({ size = "md", showText = true }: LogoProps) {
  const px = imgSizes[size];
  return (
    <div className="flex items-center gap-2">
      <img
        src={browser.runtime.getURL("icons/icon-128.png")}
        alt="AppTrack"
        width={px}
        height={px}
        className="rounded-lg"
      />
      {showText && (
        <span className={`font-semibold text-gray-900 ${textSizes[size]}`}>AppTrack</span>
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
