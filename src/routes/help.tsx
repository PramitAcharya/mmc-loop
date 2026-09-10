import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, ShieldCheck, HelpCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & Contact — MMCLoop" },
      {
        name: "description",
        content:
          "Get help with MMCLoop or contact the admin team for support, feedback, and verification requests.",
      },
    ],
  }),
  component: HelpPage,
});

const FAQ = [
  {
    q: "What is MMCLoop?",
    a: "MMCLoop is the unofficial student community platform for MMC (Makawanpur Multiple Campus) students. You can post anonymously, vote, chat, share highlights, and find out who's free on campus.",
  },
  {
    q: "How do I get verified?",
    a: 'Click "Get Verified" on the feed or activities page, or visit the /verify page. Submit a request and a moderator will review it. Verification confirms you are an MMC student and unlocks all features.',
  },
  {
    q: "Why can't I vote or post?",
    a: "Voting and posting require MMC student verification. Sign in first, then submit a verification request from the prompt on the feed or the /verify page.",
  },
  {
    q: "Is my identity safe?",
    a: "Yes. Your real name and email are only visible to moderators. Other students only see your chosen display name and username. All data is stored on Supabase with Row Level Security.",
  },
  {
    q: "How do I report a problem?",
    a: "Contact the admin at pramitinquiry@gmail.com or use the contact link below. Include screenshots if possible.",
  },
];

function HelpPage() {
  const { user, isVerifiedStudent } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Help & Contact</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Need help with MMCLoop? Find answers below or reach out to the admin team.
        </p>
      </div>

      {/* Contact Card */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Contact Admin</h2>
            <p className="text-xs text-muted-foreground">
              For verification requests, bug reports, or general inquiries:
            </p>
            <a
              href="mailto:pramitinquiry@gmail.com"
              className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              pramitinquiry@gmail.com
            </a>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        {user && !isVerifiedStudent ? (
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link to="/verify">
              <ShieldCheck className="h-4 w-4" />
              Get Verified
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="justify-start gap-2">
          <a href="mailto:pramitinquiry@gmail.com?subject=MMCLoop%20Support">
            <MessageCircle className="h-4 w-4" />
            Email Support
          </a>
        </Button>
      </div>

      {/* FAQ */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <HelpCircle className="h-5 w-5 text-primary" />
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium group-open:text-primary">
                {item.q}
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        MMCLoop is a student-run project. Not officially affiliated with MMC.
      </p>
    </div>
  );
}
