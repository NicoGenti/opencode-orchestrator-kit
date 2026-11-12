import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  Sparkles,
} from "lucide-react";

import { commands, roster } from "@/site/roster";
import type { AccessBadge, RosterAgent } from "@/site/roster-model";
import { HERO_INSTALL, INSTALL_TABS, WHATS_NEW } from "@/site/install";
import type { InstallTab } from "@/site/install";
import {
  CHANGELOG_URL,
  KIT_VERSION,
  NPM_URL,
  RELEASE_URL,
  REPO_URL,
} from "@/site/release";

const steps = [
  {
    icon: Terminal,
    title: "Bootstrap",
    description:
      "The profiler fingerprints the repo and scaffolds .context/ and plan/.",
  },
  {
    icon: RouteIcon,
    title: "Route",
    description:
      "The orchestrator reads the request and picks the specialist that should do it.",
  },
  {
    icon: Send,
    title: "Delegate",
    description: "That specialist gets one precise 9-section task spec.",
  },
  {
    icon: CheckCircle,
    title: "Verify & checkpoint",
    description:
      "Results are checked, progress.md is updated, and the plan advances one phase at a time.",
  },
];

const why = [
  {
    icon: RouteIcon,
    title: "The router stays out of your code",
    description:
      "The orchestrator classifies, delegates, and checkpoints. A routing mistake cannot silently edit the repository.",
  },
  {
    icon: Brain,
    title: "Match the model to the step",
    description:
      "Exploration and triage run on cheaper models. Stronger models are reserved for design, implementation, and review.",
  },
  {
    icon: Scale,
    title: "The plan outlives the chat",
    description:
      "Work sits on a file board and session memory stays small, so the next session can resume without replaying the whole conversation.",
  },
];

const navLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "What's new", href: "#whats-new" },
  { label: "Commands", href: "#commands" },
  { label: "Agents", href: "#agents" },
  { label: "Quickstart", href: "#quickstart" },
];

export function LandingPage() {
  const specialistLine =
    roster.primaryCount === 1
      ? `one router, ${roster.specialistCount} specialists`
      : `${roster.coreCount} core agents`;

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero specialistLine={specialistLine} />
        <HowItWorks />
        <WhatsNew />
        <Commands />
        <AgentRoster />
        <Quickstart />
        <Why />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-2 text-foreground">
          <span className="text-xl" aria-hidden="true">
            🧭
          </span>
          <span className="hidden font-semibold tracking-tight sm:inline">
            OpenCode Orchestrator Kit
          </span>
          <span className="font-semibold tracking-tight sm:hidden">O.O.K.</span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={REPO_URL}
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
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        id="mobile-nav"
        className={
          open ? "border-t border-border/50 bg-background md:hidden" : "hidden"
        }
      >
        <nav aria-label="Mobile" className="flex flex-col px-4 py-3">
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
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero({ specialistLine }: { specialistLine: string }) {
  return (
    <section className="hero-gradient relative overflow-hidden px-4 pb-24 pt-20 sm:px-6 sm:pt-28 lg:px-8 lg:pb-32 lg:pt-36">
      <div className="relative mx-auto max-w-5xl text-center">
        <div className="mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={NPM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1 text-sm font-medium text-emerald"
          >
            <span
              className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald"
              aria-hidden="true"
            />
            v{KIT_VERSION} · on npm
          </a>
          <span className="inline-flex items-center rounded-full border border-border bg-card/50 px-3 py-1 text-sm text-muted-foreground backdrop-blur-sm">
            Open-source · MIT License
          </span>
        </div>
        <h1 className="text-balance text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          OpenCode Orchestrator Kit
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
          An OpenCode plugin that sends each coding task to a specialist on the
          cheapest model that can do it. You keep a resumable plan, a smaller
          context, and a router that never edits your application code —{" "}
          {specialistLine}.
        </p>
        <div className="mx-auto mt-8 max-w-3xl text-left">
          <CodeBlock code={HERO_INSTALL} label="Copy the npm plugins entry" />
        </div>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <ExternalLink href={NPM_URL}>npm package</ExternalLink>
          <ExternalLink href={RELEASE_URL}>v{KIT_VERSION} release</ExternalLink>
          <ExternalLink href={CHANGELOG_URL}>Changelog</ExternalLink>
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={REPO_URL}
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
            Four phases from repo bootstrap to a verified checkpoint.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="group relative rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card/80"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div
                className="absolute right-4 top-4 text-4xl font-bold text-muted-foreground"
                aria-hidden="true"
              >
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

function WhatsNew() {
  return (
    <section
      id="whats-new"
      className="border-t border-border bg-secondary/30 px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" aria-hidden="true" />v{KIT_VERSION}
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            What&apos;s new in 1.0
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The kit is now an OpenCode 2 plugin, published on npm.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {WHATS_NEW.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card/80"
            >
              <h3 className="text-lg font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Commands() {
  return (
    <section id="commands" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Commands
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The plugin registers these five commands. A companion kit registers
            its own commands separately.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {commands.map((command) => (
            <article
              key={command.name}
              className="rounded-xl border border-border bg-card p-6"
            >
              <h3 className="font-mono text-base font-semibold text-foreground">
                /{command.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {command.description}
              </p>
            </article>
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
            <Users className="h-4 w-4" aria-hidden="true" />
            {roster.coreCount} core agents
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Agent roster
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-muted-foreground">
            {roster.primaryCount === 1
              ? `One router and ${roster.specialistCount} specialists ship in agents/.`
              : `${roster.coreCount} agents ship in agents/.`}{" "}
            Badges come from each file&apos;s permission block. Opt-in extras
            live in extras/ and stay off unless you ask for them.
          </p>
        </div>
        <div className="space-y-12">
          {roster.groups.map((group) => (
            <AgentGroup
              key={group.id}
              title={group.title}
              note={group.note}
              agents={group.agents}
            />
          ))}
          <AgentGroup
            title="Opt-in extras"
            note={`${roster.extrasCount} agents in extras/. Set withExtras to true on the plugin, or pass --with-extras to the legacy installer.`}
            agents={roster.extras}
          />
        </div>
      </div>
    </section>
  );
}

function AgentGroup({
  title,
  note,
  agents,
}: {
  title: string;
  note: string;
  agents: RosterAgent[];
}) {
  return (
    <div>
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <article
            key={agent.name}
            className="flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:bg-card/80"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <span className="text-2xl" aria-hidden="true">
                {agent.emoji}
              </span>
              <AccessBadgeView badge={agent.badge} detail={agent.detail} />
            </div>
            <h4 className="font-mono text-base font-semibold text-foreground">
              {agent.name}
              {agent.mode === "primary" ? (
                <span className="ml-2 font-sans text-xs font-medium text-muted-foreground">
                  router
                </span>
              ) : null}
            </h4>
            <p className="mt-1 flex-grow text-sm text-muted-foreground">
              {agent.summary}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function AccessBadgeView({
  badge,
  detail,
}: {
  badge: AccessBadge;
  detail: string;
}) {
  const tone =
    badge === "read-only"
      ? "bg-emerald/10 text-emerald"
      : badge === "scoped write"
        ? "bg-primary/10 text-primary"
        : "bg-amber/10 text-amber";
  return (
    <span
      title={detail}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {badge}
    </span>
  );
}

function Quickstart() {
  const [activeId, setActiveId] = useState(INSTALL_TABS[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active =
    INSTALL_TABS.find((tab) => tab.id === activeId) ?? INSTALL_TABS[0];

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = INSTALL_TABS.findIndex((tab) => tab.id === activeId);
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % INSTALL_TABS.length;
    else if (event.key === "ArrowLeft") {
      next = (index - 1 + INSTALL_TABS.length) % INSTALL_TABS.length;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = INSTALL_TABS.length - 1;
    else return;
    event.preventDefault();
    const id = INSTALL_TABS[next].id;
    setActiveId(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <section id="quickstart" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Quickstart
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            On OpenCode 2, install the npm package. Git, a local directory, the
            legacy installer, and OpenCode Studio are the other paths.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-2 sm:p-6">
          <div
            role="tablist"
            aria-label="Install methods"
            aria-orientation="horizontal"
            onKeyDown={onTabKeyDown}
            className="flex gap-2 overflow-x-auto border-b border-border pb-4"
          >
            {INSTALL_TABS.map((tab) => {
              const selected = tab.id === active.id;
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabRefs.current[tab.id] = node;
                  }}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                  className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.deprecated ? (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide">
                      deprecated
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <InstallPanel tab={active} />
        </div>
      </div>
    </section>
  );
}

function InstallPanel({ tab }: { tab: InstallTab }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${tab.id}`}
      aria-labelledby={`tab-${tab.id}`}
      tabIndex={0}
      className="space-y-4 pt-6"
    >
      {tab.deprecated ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          Deprecated on OpenCode 2. Kept for OpenCode 1.x and offline use.
        </p>
      ) : null}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {tab.intro}
      </p>
      <CodeBlock code={tab.code} label={`Copy the ${tab.label} install`} />
      <p className="text-sm leading-relaxed text-muted-foreground">
        {tab.note}
      </p>
      {tab.link ? (
        <p>
          <ExternalLink href={tab.link.href}>{tab.link.label}</ExternalLink>
        </p>
      ) : null}
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
        aria-label={copied ? "Copied" : label}
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
            Spend the strong model on the steps that need it, and keep the rest
            of the session cheap enough to finish.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {why.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card/80"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
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
        <p className="text-center text-sm text-muted-foreground sm:text-left">
          MIT License ·{" "}
          <ExternalLink href={REPO_URL}>
            GitHub: NicoGenti/opencode-orchestrator-kit
          </ExternalLink>
          {" · "}
          <ExternalLink href={NPM_URL}>npm</ExternalLink>
          {" · "}
          <ExternalLink href={CHANGELOG_URL}>Changelog</ExternalLink>
        </p>
        <a
          href="#top"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-4 transition-colors hover:text-primary"
    >
      {children}
    </a>
  );
}
