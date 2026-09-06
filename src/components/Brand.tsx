export function LoopMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <path
        d="M11 8a8 8 0 1 0 0 16c5 0 6-8 10-8a5 5 0 1 1 0 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`loop-wordmark inline-flex items-center gap-2 text-xl ${className}`}>
      <span className="text-primary">
        <LoopMark />
      </span>
      <span>
        MMC<span className="text-primary">Loop</span>
      </span>
    </span>
  );
}
