import { useState } from "react";
import {
  Github,
  ChevronDown,
  Terminal,
  Route as RouteIcon,
  Send,
  CheckCircle,
  Users,
  Brain,
  Scale,
  Copy,
  Check,
  Menu,
  X,
} from "lucide-react";

const GITHUB_URL = "https://github.com/NicoGenti/opencode-orchestrator-kit";

const steps = [
  {
    icon: Terminal,
    title: "Bootstrap",
    description:
      "Profiler fingerprints the repo and scaffolds .context/ and plan/",
  },
  {
    icon: RouteIcon,
    title: "Route",
    description:
      "Orchestrator reads the request and picks the right specialist",
  },
  {
    icon: Send,
    title: "Delegate",
    description: "Each specialist gets a precise 9-section task spec",
  },
  {
    icon: CheckCircle,
    title: "Verify & checkpoint",
    description:
      "Results validated, progress.md updated, plan advances phase by phase",
  },
];

const agents = [
  {
    emoji: "🧭",
    name: "orchestrator",
    role: "Routes every request, never executes",
    badge: "read-only" as const,
  },
  {
    emoji: "🩺",
    name: "profiler",
    role: "Repo bootstrap & context scaffolding",
    badge: "write" as const,
  },
  {
    emoji: "🔎",
    name: "explorer",
    role: "Codebase research",
    badge: "read-only" as const,
  },
  {
    emoji: "📚",
    name: "librarian",
    role: "Docs & repo history",
    badge: "read-only" as const,
  },
  {
    emoji: "🔮",
    name: "oracle",
    role: "Architecture advice",
    badge: "read-only" as const,
  },
  {
    emoji: "🗺️",
    name: "planner",
    role: "Phased plans (writes to plan/draft/ only)",
    badge: "write" as const,
  },
  {
    emoji: "🔧",
    name: "developer-fixer",
    role: "Implementation & TDD",
    badge: "write" as const,
  },
  {
    emoji: "🧪",
    name: "test-engineer",
    role: "Tests & coverage",
    badge: "write" as const,
  },
  {
    emoji: "🛡️",
    name: "code-reviewer",
    role: "Code review",
    badge: "read-only" as const,
  },
  {
    emoji: "🔐",
    name: "security",
    role: "Security review",
    badge: "read-only" as const,
  },
  {
    emoji: "🏗️",
    name: "build-helper",
    role: "Build/CI triage",
    badge: "read-only" as const,
  },
  {
    emoji: "📦",
    name: "npm-helper",
    role: "npm/dependency triage",
    badge: "read-only" as const,
  },
  {
    emoji: "🚀",
    name: "deploy-helper",
    role: "Deployment triage",
    badge: "read-only" as const,
  },
  {
    emoji: "🖥️",
    name: "pc-doctor",
    role: "Environment/OS triage",
    badge: "read-only" as const,
  },
  {
    emoji: "✍️",
    name: "writer",
    role: "Documentation",
    badge: "write" as const,
  },
];

const features = [
  {
    icon: RouteIcon,
    title: "Routes, never executes",
    description:
      "The orchestrator decides who should act and stays out of your application code. Specialists own every implementation detail.",
  },
  {
    icon: Brain,
    title: "Matches model to task",
    description:
      "Cheap models handle exploration and research. Powerful models are reserved for design, security, and final review.",
  },
  {
    icon: Scale,
    title: "Keeps context small",
    description:
      "Session memory is auto-archived past ~3k tokens, so each specialist receives only the context it needs.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <HowItWorks />
      <AgentRoster />
      <Quickstart />
      <Why />
      <Footer />
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const navLinks = [
    { label: "How it works", href: "#how-it-works" },
    { label: "Agents", href: "#agents" },
    { label: "Quickstart", href: "#quickstart" },
    { label: "Why", href: "#why" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#" className="flex items-center gap-2 text-foreground">
          <span className="text-xl">🧭</span>
          <span className="hidden font-semibold tracking-tight sm:inline">
            OpenCode Orchestrator Kit
          </span>
          <span className="font-semibold tracking-tight sm:hidden">O.O.K.</span>
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </nav>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/50 bg-background md:hidden">
          <nav className="flex flex-col px-4 py-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="hero-gradient relative overflow-hidden px-4 pb-24 pt-20 sm:px-6 sm:pt-28 lg:px-8 lg:pb-32 lg:pt-36">
      <div className="relative mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center rounded-full border border-border bg-card/50 px-3 py-1 text-sm text-muted-foreground backdrop-blur-sm">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald" />
          Open-source · MIT License
        </div>
        <h1 className="text-balance text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          OpenCode Orchestrator Kit
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
          Cost-aware multi-agent orchestrator for OpenCode CLI — one router, 14
          specialists, zero application code touched by the router.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30 sm:w-auto"
          >
            <Github className="h-5 w-5" />
            View on GitHub
          </a>
          <a
            href="#quickstart"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-all hover:border-primary/50 hover:bg-secondary sm:w-auto"
          >
            Quickstart
            <ChevronDown className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Four phases from repo bootstrap to verified checkpoint.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="group relative rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card/80"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <div className="absolute right-4 top-4 text-4xl font-bold text-muted-foreground/20">
                {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentRoster() {
  return (
    <section
      id="agents"
      className="border-t border-border bg-secondary/30 px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            15 specialists
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Agent Roster
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every agent has a narrow mandate and a clear read/write contract.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:bg-card/80"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {agent.emoji}
                </span>
                <Badge variant={agent.badge}>{agent.badge}</Badge>
              </div>
              <h3 className="font-mono text-base font-semibold text-foreground">
                {agent.name}
              </h3>
              <p className="mt-1 flex-grow text-sm text-muted-foreground">
                {agent.role}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "read-only" | "write";
}) {
  const isReadOnly = variant === "read-only";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isReadOnly ? "bg-emerald/10 text-emerald" : "bg-amber/10 text-amber"
      }`}
    >
      {children}
    </span>
  );
}

function Quickstart() {
  const [activeTab, setActiveTab] = useState<"native" | "studio">("native");

  return (
    <section id="quickstart" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Quickstart
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Get the kit running in under a minute.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-2 sm:p-6">
          <div className="flex gap-2 border-b border-border pb-4">
            <button
              type="button"
              onClick={() => setActiveTab("native")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "native"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              Native OpenCode
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("studio")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "studio"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              OpenCode Studio
            </button>
          </div>

          <div className="pt-6">
            {activeTab === "native" ? (
              <div className="space-y-6">
                <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
                  <li>
                    Clone the repo or copy{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      agents/
                    </code>
                    ,{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      skills/
                    </code>
                    ,{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      AGENTS.md
                    </code>
                    ,{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      CONTRIBUTING.md
                    </code>{" "}
                    into your project.
                  </li>
                  <li>
                    Place them under{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      .opencode/
                    </code>{" "}
                    (project-only) or{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      ~/.config/opencode/
                    </code>{" "}
                    (global).
                  </li>
                  <li>
                    Run{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      opencode
                    </code>{" "}
                    and invoke{" "}
                    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-cyan">
                      @orchestrator
                    </code>
                    .
                  </li>
                  <li>
                    On first run, the profiler auto-bootstraps — no manual
                    config needed.
                  </li>
                </ol>
                <CodeBlock code="./install.sh" />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-secondary/50 p-6 text-center">
                <p className="text-muted-foreground">
                  OpenCode Studio support is on the roadmap. For now, follow the
                  Native OpenCode steps above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy errors
    }
  };

  return (
    <div className="code-block relative">
      <pre className="overflow-x-auto p-4 pr-12">
        <code className="text-cyan">{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-3 top-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function Why() {
  return (
    <section
      id="why"
      className="border-t border-border px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why this exists
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built to keep multi-agent workflows cheap, correct, and composable.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card/80"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          MIT License ·{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4 transition-colors hover:text-primary"
          >
            GitHub: NicoGenti/opencode-orchestrator-kit
          </a>
        </p>
        <a
          href="#"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
