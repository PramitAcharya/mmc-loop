import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchCategories } from "@/lib/community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MentionTextarea } from "@/components/MentionTextarea";
import { syncMentions } from "@/lib/mentions";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create a post — MMCLoop" },
      {
        name: "description",
        content:
          "Share a question, a college issue, study help or something fun with the MMC student community. Post publicly or anonymously.",
      },
      { property: "og:title", content: "Create a post — MMCLoop" },
      {
        property: "og:description",
        content: "Post publicly or as Anonymous Student on MMCLoop.",
      },
    ],
  }),
  component: CreatePost,
});

const schema = z.object({
  title: z.string().trim().min(6, "Title must be at least 6 characters").max(140),
  body: z.string().trim().max(5000).optional(),
  categoryId: z.string().uuid("Pick a category"),
});

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function CreatePost() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ title, body, categoryId });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setBusy(true);

    let imagePath: string | null = null;
    if (file) {
      if (file.size > MAX_IMAGE_BYTES) {
        setBusy(false);
        toast.error("Images must be smaller than 3 MB");
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("post-images").upload(path, file);
      if (upErr) {
        setBusy(false);
        toast.error("Image upload failed. Try a smaller file.");
        return;
      }
      imagePath = path;
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_user_id: user.id,
        title: parsed.data.title,
        body: parsed.data.body?.trim() ? parsed.data.body.trim() : null,
        category_id: parsed.data.categoryId,
        is_anonymous: anonymous,
        image_url: imagePath,
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      toast.error("Could not publish your post. Please try again.");
      return;
    }
    if (parsed.data.body?.trim()) await syncMentions("post", data.id, parsed.data.body.trim());
    setBusy(false);
    toast.success(anonymous ? "Posted as Anonymous Student" : "Post published");
    navigate({ to: "/post/$postId", params: { postId: data.id } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Create a post</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Be kind, keep it about student life, and avoid sharing personal details.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="surface-panel space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            maxLength={140}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!errors["title"]}
            aria-describedby={errors["title"] ? "title-error" : undefined}
            required
          />
          {errors["title"] ? (
            <p id="title-error" className="text-sm text-destructive">
              {errors["title"]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="category" aria-invalid={!!errors["categoryId"]}>
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors["categoryId"] ? (
            <p className="text-sm text-destructive">{errors["categoryId"]}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">Details (optional)</Label>
          <MentionTextarea
            id="body"
            value={body}
            rows={7}
            maxLength={5000}
            onValueChange={setBody}
          />
          <p className="text-xs text-muted-foreground">
            Type @ to mention another student.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="image">Image (optional, max 3 MB)</Label>
          <Input
            id="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
          <Switch id="anon" checked={anonymous} onCheckedChange={setAnonymous} />
          <div>
            <Label htmlFor="anon">Post anonymously</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Other students will only see “Anonymous Student”. Your account still owns the post so
              you can delete it, and moderators can act on abuse reports.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/feed" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Publishing…" : "Publish post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
