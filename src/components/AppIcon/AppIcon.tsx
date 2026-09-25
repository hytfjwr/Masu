import { memo, useId } from 'react';

/**
 * Tabula app mark: a glassy accent-gradient tile holding a tiny sheet whose top row is one
 * merged cell (the same merge story the splash tells). Tilts in 3D on hover (index.css `.app-icon`).
 */
export const AppIcon = memo(function AppIcon({ size = 32 }: { size?: number }) {
  const id = useId();
  const gradient = `${id}-g`;
  const sheen = `${id}-s`;
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Tabula"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-accent-selection)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-accent-formula)' }} />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <rect width="32" height="16" rx="9" fill={`url(#${sheen})`} />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8.5"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
      />
      <rect x="7" y="8" width="18" height="7" rx="2" fill="#fff" />
      <rect x="7" y="17" width="8" height="7" rx="2" fill="#fff" fillOpacity="0.72" />
      <rect x="17" y="17" width="8" height="7" rx="2" fill="#fff" fillOpacity="0.72" />
    </svg>
  );
});
