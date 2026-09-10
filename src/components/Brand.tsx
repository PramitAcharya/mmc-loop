export function LoopMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" className={className}>
      <defs>
        <linearGradient
          id="loopGrad"
          x1="16"
          y1="8"
          x2="120"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#007e80" />
          <stop offset="1" stopColor="#00676e" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#loopGrad)" strokeWidth="11" strokeLinecap="round">
        <path d="M44 32a32 32 0 1 0 0 64c20 0 24-32 40-32a20 20 0 1 1 0 40" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`loop-wordmark inline-flex items-center gap-2 text-xl ${className}`}>
      <span>
        <LoopMark />
      </span>
      <span>
        MMC<span className="text-primary">Loop</span>
      </span>
    </span>
  );
}
