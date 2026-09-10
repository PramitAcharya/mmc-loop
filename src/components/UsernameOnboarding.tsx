import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UsernamePicker } from "@/components/UsernamePicker";
import { useAuth } from "@/lib/auth";

/**
 * Shown once to any signed-in student who has not picked their own username yet
 * (typically after a Google sign-in, where we only had an auto-generated name).
 */
export function UsernameOnboarding() {
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const open = !!user && !profileLoading && !!profile && !profile.username_confirmed;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choose your username</DialogTitle>
          <DialogDescription>
            This is how other students will see you on MMCLoop. You can change it later in settings.
          </DialogDescription>
        </DialogHeader>
        <UsernamePicker
          initialValue={profile?.username ?? ""}
          submitLabel="Save and continue"
          onSaved={(name) => {
            toast.success(`You're now @${name}`);
            refreshProfile();
            queryClient.invalidateQueries();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
