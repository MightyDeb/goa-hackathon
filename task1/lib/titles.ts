/**
 * Builder-title pool. Fully local, zero network, zero failure modes (plan §3).
 * Curated phrases rather than mad-libs — reads intentional, not generated.
 */
export const BUILDER_TITLES: readonly string[] = [
  "Chaos Engineer of Panjim",
  "Full-Stack Beach Coder",
  "Prod-Breaker in Residence",
  "Susegad Systems Architect",
  "Midnight Merge Conflict Survivor",
  "Shipper of the Arabian Sea",
  "Latency Whisperer of Anjuna",
  "Rollback Artist, Baga Division",
  "Feni-Powered Refactorer",
  "Barefoot Backend Baron",
  "Regex Lifeguard on Duty",
  "Monsoon-Grade Debugger",
  "Deploy-on-Friday Believer",
  "Sandy Keyboard Specialist",
  "Cache Invalidation Daredevil",
  "Vindaloo Velocity Engineer",
  "Off-by-One Beach Bum",
  "Null Pointer Navigator",
  "Sunset-Driven Developer",
  "Hot Reload Hammock Hacker",
  "Palm-Shaded Pull Requester",
  "Cascading Style Sea-Breezer",
  "Terminal Tan Line Holder",
  "Prompt Engineer of Palolem",
  "Race Condition Referee",
  "Stack Trace Cartographer",
  "Low-Latency Lounger",
  "Yak-Shaving Grandmaster",
  "Commit Message Poet Laureate",
  "Semicolon Skeptic of Calangute",
  "Uptime Custodian, Miramar",
  "Coconut-Cooled GPU Operator",
  "Ctrl-Z Historian",
  "Force-Push Folk Hero",
  "Schema Migration Surfer",
  "Boss-Level Bug Bounty Beachgoer",
  "Zero-Downtime Daydreamer",
  "Tide-Table Task Scheduler",
  "Rate-Limit Rebel of Vagator",
  "Dark Mode Devotee",
  "Legacy Code Lifeguard",
  "Infinite Scroll Idealist",
  "Localhost Legend of Mapusa",
  "Trailing Whitespace Vigilante",
  "Serverless Sunbather",
  "Edge Case Explorer, Dudhsagar",
  "Hackathon Hammock Champion",
  "Kernel Panic Peacekeeper",
  "Load-Bearing Intern Energy",
  "Ship-It Shack Proprietor",
];

/**
 * Pick a title that isn't the one currently shown, so a reroll always visibly
 * changes something. Synchronous by design — the reroll must feel instant.
 */
export function rollTitle(previous?: string): string {
  if (BUILDER_TITLES.length === 1) return BUILDER_TITLES[0];
  let next = previous;
  while (next === previous) {
    next = BUILDER_TITLES[Math.floor(Math.random() * BUILDER_TITLES.length)];
  }
  return next as string;
}

export const ROLES: readonly string[] = [
  "Full-Stack",
  "Frontend",
  "Backend",
  "Mobile",
  "ML / AI",
  "Data",
  "Infra / DevOps",
  "Security",
  "Design",
  "Product",
  "Hardware",
  "Founder",
];
