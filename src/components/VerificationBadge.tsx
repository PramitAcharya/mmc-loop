import { ShieldCheck, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerificationBadge({
  status,
  className,
  size = "sm",
}: {
  status: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (status !== "verified") return null;

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <span
      title="Verified MMC Student"
      className={cn("inline-flex items-center text-primary", className)}
    >
      <ShieldCheck
        className={cn(sizeClasses[size], "fill-primary/20")}
        aria-label="Verified MMC Student"
      />
    </span>
  );
}

export function AdminBadge({
  isAdmin,
  isModerator,
  className,
  size = "sm",
}: {
  isAdmin: boolean | null;
  isModerator: boolean | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (!isAdmin && !isModerator) return null;

  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4.5 w-4.5",
    lg: "h-5.5 w-5.5",
  };

  const isModOnly = !isAdmin && isModerator;

  return (
    <span
      title={isAdmin ? "Administrator" : "Moderator"}
      className={cn(
        "inline-flex items-center",
        isAdmin ? "text-amber-500" : "text-blue-500",
        className,
      )}
    >
      <Shield
        className={cn(
          sizeClasses[size],
          isAdmin && "fill-amber-500/20",
          isModOnly && "fill-blue-500/20",
        )}
        aria-label={isAdmin ? "Administrator" : "Moderator"}
      />
    </span>
  );
}
