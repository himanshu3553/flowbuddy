// The one registry of the four live capabilities and their dedicated pages.
// Keys match the homepage layer-section consumer keys; every surface that
// links a capability (homepage tiles, footer, the powered-by band's sibling
// links) reads slugs from here so a renamed page moves everywhere at once.
export interface Capability {
  /** Matches the homepage layer-section consumer key. */
  key: 'assistant' | 'guidance' | 'walkthrough' | 'agent';
  /** Page route, with leading slash. */
  slug: string;
  title: string;
  /** One-liner used wherever the capability is linked from. */
  short: string;
  beta?: boolean;
}

export const capabilities: Capability[] = [
  {
    key: 'assistant',
    slug: '/in-app-ai-assistant',
    title: 'In-App AI Assistant',
    short: 'Grounded answers inside your product, from approved knowledge only.',
  },
  {
    key: 'guidance',
    slug: '/contextual-guidance',
    title: 'Contextual Guidance',
    short: 'Reads where your user is and highlights the next step in your UI.',
  },
  {
    key: 'walkthrough',
    slug: '/interactive-onboarding',
    title: 'Interactive Onboarding',
    short: 'Guided walkthroughs that advance as your user completes each step.',
  },
  {
    key: 'agent',
    slug: '/ai-agent-execution',
    title: 'AI Agent Execution',
    short: 'Consented runs that carry out the steps for your user.',
    beta: true,
  },
];

export const capabilityByKey = Object.fromEntries(capabilities.map((c) => [c.key, c])) as Record<
  Capability['key'],
  Capability
>;
