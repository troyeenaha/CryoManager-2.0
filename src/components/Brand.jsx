import { useId, useState } from 'react';

export function BrandMark({ className = 'h-9 w-9' }) {
  const gid = `cm-g-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0F766E" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
      <path d="M16 16L16 5.5M16 9.8L18.4 7.4M16 9.8L13.6 7.4M16 16L6.91 10.75M10.63 12.9L9.75 9.62M10.63 12.9L7.35 13.78M16 16L6.91 21.25M10.63 19.1L7.35 18.22M10.63 19.1L9.75 22.38M16 16L16 26.5M16 22.2L13.6 24.6M16 22.2L18.4 24.6M16 16L25.09 21.25M21.37 19.1L22.25 22.38M21.37 19.1L24.65 18.22M16 16L25.09 10.75M21.37 12.9L24.65 13.78M21.37 12.9L22.25 9.62" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      <circle cx="16" cy="16" r="1.6" fill="#fff" />
    </svg>
  );
}

/**
 * Lab logo at the bottom of the sidebar. Drop the authorised image at
 * public/thurber-lab-logo.png and it appears automatically; until then a
 * text label is shown.
 */
export function LabLogo({ className = 'max-h-14' }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/thurber-lab-logo.png"
        alt="Thurber Lab"
        className={`${className} w-auto mx-auto object-contain`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-slate-700 tracking-wide">THURBER LAB</div>
      <div className="text-[11px] text-slate-400">University of Michigan</div>
    </div>
  );
}
