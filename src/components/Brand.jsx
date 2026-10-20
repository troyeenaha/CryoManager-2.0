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
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" />
        <path d="M13 7.5l3 2.5 3-2.5M13 24.5l3-2.5 3 2.5" />
      </g>
    </svg>
  );
}

/**
 * Lab logo at the bottom of the sidebar. Drop the authorised image at
 * public/thurber-lab-logo.png and it appears automatically; until then a
 * text label is shown.
 */
export function LabLogo() {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/thurber-lab-logo.png"
        alt="Thurber Lab"
        className="max-h-12 w-auto mx-auto object-contain"
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
