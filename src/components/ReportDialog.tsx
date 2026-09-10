import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { REPORT_REASONS } from "@/lib/mmc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export function ReportDialog({
  targetId,
  targetType,
}: {
  targetId: string;
  targetType: "post" | "comment" | "activity" | "activity_comment";
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user) {
      toast.error("Sign in to report content");
      return;
    }
    if (details.length > 500) {
      toast.error("Details must be under 500 characters");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("reports").insert({
      reporter_user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() ? details.trim() : null,
    });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "You already reported this" : "Could not send the report",
      );
      return;
    }
    toast.success("Report sent to moderators");
    setOpen(false);
    setDetails("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Flag className="mr-1 h-4 w-4" aria-hidden="true" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {targetType}</DialogTitle>
          <DialogDescription>
            Reports are reviewed by MMCLoop community moderators, not by the campus.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="space-y-1">
          {REPORT_REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <RadioGroupItem value={r.value} id={`${targetId}-${r.value}`} />
              <Label htmlFor={`${targetId}-${r.value}`}>{r.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-2">
          <Label htmlFor={`${targetId}-details`}>Extra details (optional)</Label>
          <Textarea
            id={`${targetId}-details`}
            value={details}
            maxLength={500}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Anything moderators should know?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
