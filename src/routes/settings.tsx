import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Monitor, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UsernamePicker } from "@/components/UsernamePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/States";
import { useAuth } from "@/lib/auth";
import { useTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Your settings — MMCLoop" },
      {
        name: "description",
        content:
          "Update your MMCLoop username, display name and bio, and switch between light and dark appearance.",
      },
      { property: "og:title", content: "Your settings — MMCLoop" },
      { property: "og:description", content: "Manage your MMCLoop account and appearance." },
    ],
  }),
  component: SettingsPage,
});

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function SettingsPage() {
  const { user, loading, profile, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/settings" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const name = displayName.trim();
    if (name.length > 40) {
      toast.error("Display name must be 40 characters or fewer");
      return;
    }
    if (bio.trim().length > 200) {
      toast.error("Bio must be 200 characters or fewer");
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase.rpc("update_my_profile", {
      ...(name ? { _display_name: name } : {}),
      ...(bio.trim() ? { _bio: bio.trim() } : {}),
      ...(profile.avatar_url ? { _avatar_url: profile.avatar_url } : {}),
    });
    setSavingProfile(false);
    if (error) {
      toast.error("Could not save your profile. Please try again.");
      return;
    }
    toast.success("Profile updated");
    refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage how you appear on MMCLoop and how the app looks.
        </p>
      </div>

      <section aria-labelledby="appearance" className="surface-panel space-y-3 p-5">
        <h2 id="appearance" className="text-lg font-semibold">
          Appearance
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose light, dark, or follow your device setting.
        </p>
        <div role="radiogroup" aria-labelledby="appearance" className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              variant={theme === t.value ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(t.value)}
            >
              <t.icon className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t.label}
            </Button>
          ))}
        </div>
      </section>

      {profileLoading && !profile ? <ListSkeleton rows={1} /> : null}

      {profile ? (
        <>
          <section aria-labelledby="username-section" className="surface-panel space-y-3 p-5">
            <h2 id="username-section" className="text-lg font-semibold">
              Username
            </h2>
            <p className="text-sm text-muted-foreground">
              You are currently{" "}
              <span className="font-medium text-foreground">@{profile.username}</span>. Changing it
              keeps all of your existing posts, comments and votes.
            </p>
            <UsernamePicker
              initialValue={profile.username}
              submitLabel="Save username"
              onSaved={(name) => {
                toast.success(`Your username is now @${name}`);
                refreshProfile();
                queryClient.invalidateQueries();
                navigate({ to: "/profile/$username", params: { username: name } });
              }}
            />
          </section>

          <section aria-labelledby="profile-section" className="surface-panel space-y-3 p-5">
            <h2 id="profile-section" className="text-lg font-semibold">
              Profile
            </h2>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  maxLength={40}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shown next to your username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Short bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  rows={3}
                  maxLength={200}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="BCA student, futsal on Saturdays…"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save profile"}
                </Button>
                <Button asChild variant="outline" type="button">
                  <Link to="/profile/$username" params={{ username: profile.username }}>
                    View my profile
                  </Link>
                </Button>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
