// The full FAQ set behind /faq — grouped, and the single source for BOTH the
// page and its FAQPage JSON-LD. Like `faqs.ts`, `a` is plain text used verbatim
// in structured data: keep it markup-free.
//
// Two deliberate copy rules live here, because this file is where a future
// editor would break them:
//   1. This page says "FlowBuddy AI" throughout — it is written for people and
//      engines searching that phrase. The rest of the site says "FlowBuddy".
//   2. Acting (a run the assistant drives itself) is sold as BETA — and always
//      with the full trust framing: off by default, switched on deliberately,
//      every run consented, stoppable, outcome-verified. What stays DIRECTION,
//      never available, is THIRD-PARTY agent access to the knowledge layer —
//      the guardrail /future is written inside.
// The homepage keeps its own shorter, objection-shaped set in `faqs.ts`.
import type { Faq } from './faqs';

export interface FaqCategory {
  /** Anchor + in-page nav target. */
  id: string;
  title: string;
  items: Faq[];
}

export const faqCategories: FaqCategory[] = [
  {
    id: 'about',
    title: 'About FlowBuddy AI',
    items: [
      {
        q: 'What is FlowBuddy AI?',
        a: 'FlowBuddy AI is an application intelligence layer for SaaS products. You show it your product once by recording a walkthrough; it learns how your software works — the workflows, the concepts, the screens — and you approve what it may use. That one approved layer, embedded with a single script tag, then powers an in-app AI assistant, contextual guidance, interactive onboarding, and, in beta, AI agent execution.',
      },
      {
        q: 'What is an application intelligence layer?',
        a: 'An application intelligence layer is a layer that sits on top of a software product and understands how the product itself works: which workflows exist and how they are done, what the product’s concepts mean, and which screen a user is looking at. Instead of feeding documents to a chatbot, FlowBuddy AI builds this layer from a recorded walkthrough of the real product, keeps every piece of it founder-approved, and uses it to power help, guidance, onboarding, and AI agent execution inside the product.',
      },
      {
        q: 'What does FlowBuddy AI do for SaaS products?',
        a: 'It answers your users’ questions in the moment, inside your product, without sending them to a help portal or a support queue. Because it knows which page a user is on, it can point at their next step in your own interface instead of just describing it, and walk them through a whole task end to end.',
      },
      {
        q: 'Who should use FlowBuddy AI?',
        a: 'SaaS teams whose product is powerful enough that users need help using it — and who would rather answer the how-do-I questions once than repeatedly in a support inbox. It is built for founders and small teams first: setup is a recording and a script tag, so no one needs a documentation team or a dedicated support engineer to get value from it.',
      },
      {
        q: 'How is FlowBuddy AI different from traditional AI chatbots and help centers?',
        a: 'A help center makes users leave your product to search, and a generic AI chatbot answers from whatever documents it was fed, with no idea where the user is or what they are looking at. FlowBuddy AI is inside your product, knows the page the user is on, and answers only from workflows you recorded and approved — showing the source behind each answer.',
      },
      {
        q: 'How is FlowBuddy AI different from product tours and onboarding tools?',
        a: 'Product tours are built by hand, run on a fixed script, and fire whether or not the user needed them. FlowBuddy AI is built from a recording rather than assembled step by step, and it reacts to what the user actually asks. Instead of one scripted path shown to everyone on day one, it answers the question in front of the user, whenever it comes up.',
      },
    ],
  },
  {
    id: 'how-it-works',
    title: 'How FlowBuddy AI works',
    items: [
      {
        q: 'How does FlowBuddy AI work?',
        a: 'Three steps. You record a walkthrough of your product with the FlowBuddy Chrome extension. FlowBuddy AI turns that recording into product knowledge and step-by-step workflows for you to review and approve. Then you paste one small script tag into your app, and the assistant goes live for your users.',
      },
      {
        q: 'How does FlowBuddy AI learn how my SaaS product works?',
        a: 'By watching you use it — the same way you would show a new teammate around. The Chrome recorder captures the walkthrough as you click through a task, and FlowBuddy AI turns that session into a described workflow with its individual steps. You do not write any of it: you review what it produced and approve what the assistant is allowed to use.',
      },
      {
        q: 'Does FlowBuddy AI require an existing knowledge base or help center?',
        a: 'No. The recording is the knowledge base. Most products need help precisely because nobody had time to write the documentation, so FlowBuddy AI is built to start from zero written material — your demo of the product is the entire setup.',
      },
      {
        q: 'How does FlowBuddy AI provide context-aware help inside my SaaS product?',
        a: 'The assistant knows which page of your product the user is on and what that screen shows, so it can tell where they are inside a workflow. That turns a vague answer into a specific one: rather than describing a button in words, it can highlight the exact next step on the page the user is already looking at.',
      },
      {
        q: 'Can FlowBuddy AI guide users step by step through product workflows?',
        a: 'Yes. For an approved workflow the assistant can run an interactive walkthrough: it highlights the next step in your interface, waits for the user to do it, notices when it is done, and moves on. The user stays in control the whole way through and can stop at any point.',
      },
    ],
  },
  {
    id: 'setup',
    title: 'Recording and setup',
    items: [
      {
        q: 'How do I record my first product workflow in FlowBuddy AI?',
        a: 'Install the FlowBuddy Chrome extension, open your product, hit record, and complete one real task the way you would demonstrate it to a new customer. Stop the recording, and FlowBuddy AI processes it into a workflow you can review, edit the description of, and approve. One task is enough to see the assistant answer.',
      },
      {
        q: 'How long does it take to set up FlowBuddy AI?',
        a: 'About as long as one product demo. Recording takes as long as the task itself, approving the result takes a few minutes, and going live is a paste. Most products can be answering their users’ questions in around 30 minutes.',
      },
      {
        q: 'Do I need developer support to install FlowBuddy AI?',
        a: 'No. Recording and approving happen in your browser, and going live means pasting one small script tag into your app — the kind of change anyone who can edit your site can make. There is no SDK to integrate and no code to write.',
      },
      {
        q: 'How is FlowBuddy AI installed in my SaaS application?',
        a: 'With a single script tag that carries your workspace’s public embed key. Drop it into your app’s HTML and the assistant appears for your users. Its appearance and settings are served live from FlowBuddy Studio, so changing how it looks or what it may answer never means editing the snippet again.',
      },
      {
        q: 'Does FlowBuddy AI change my product’s UI or layout?',
        a: 'No. The assistant is an overlay — a small floating helper on top of your product. It never moves, resizes, or restyles anything on your pages, and it does not touch your CSS. You can match its accent color to your brand so it looks like it belongs.',
      },
    ],
  },
  {
    id: 'trust',
    title: 'Accuracy, security and privacy',
    items: [
      {
        q: 'Does FlowBuddy AI hallucinate or make up answers?',
        a: 'It is built specifically not to. The assistant answers only from the workflows you recorded and approved, and it shows which workflow each answer came from. When a question is not covered by anything you approved, it says it does not know yet rather than guessing — and that gap tells you exactly what to record next.',
      },
      {
        q: 'How does FlowBuddy AI ensure that its answers are accurate?',
        a: 'Accuracy comes from the boundary, not from a bigger model. Every step in a workflow is anchored to something that actually happened in your recording, nothing reaches your users until you approve it, and anything you retire stops being used immediately. Each answer names its source workflow, so you can check any answer against what you approved.',
      },
      {
        q: 'How does FlowBuddy AI handle sensitive data during product recording?',
        a: 'Sensitive fields are masked in your browser while you record — before anything leaves your machine. You are also in control of what gets recorded: you choose the task and can stop at any point, and nothing from a recording reaches your users until you have reviewed and approved the workflow it produced.',
      },
      {
        q: 'How does FlowBuddy AI protect customer data and privacy?',
        a: 'The assistant reads your approved workflows to answer questions; it is not a pipeline for exporting your users’ data. The embed key in your page is public-safe by design: it works only on the domains you allow, and you can rotate it at any time. Full details are in our privacy policy.',
      },
    ],
  },
  {
    id: 'impact',
    title: 'Business impact',
    items: [
      {
        q: 'Can FlowBuddy AI reduce customer support tickets?',
        a: 'That is what it is built for. Most support volume is how-do-I questions with a known answer, and those are exactly what the assistant handles — in the product, at the moment the user is stuck, before a ticket gets written. Your team keeps its time for the conversations that genuinely need a human.',
      },
      {
        q: 'Can FlowBuddy AI improve SaaS onboarding and user activation?',
        a: 'It targets the place onboarding usually fails: a new user gets stuck on one screen, cannot find the answer, and quietly leaves. The assistant meets them on that screen and shows them the next step, so more users get through setup and reach the moment your product proves its value.',
      },
      {
        q: 'Can FlowBuddy AI help users complete tasks inside my product?',
        a: 'Yes — by guiding them through it. The assistant highlights each next step in your interface and confirms it is done before moving on, so the user completes the real task in your product rather than reading about it. It can also carry out the steps itself — AI Agent Execution, now in beta: off by default, switched on deliberately per workspace, and every run starts with the user’s consent.',
      },
    ],
  },
  {
    id: 'agents',
    title: 'AI agents and the future',
    items: [
      {
        q: 'Can FlowBuddy AI perform actions inside my SaaS product?',
        a: 'Yes — AI Agent Execution is in beta. When you enable it, the assistant can run an approved workflow itself: it shows the user what it is about to do, waits for their explicit consent, then fills fields and clicks through the steps while narrating each one. The user can stop the run at any time, sensitive values are always typed by the user directly into your product’s own fields, and the outcome is verified before the run reports done.',
      },
      {
        q: 'Can FlowBuddy AI work with AI agents?',
        a: 'In two ways. Inside your product, FlowBuddy AI’s own agent can carry out approved workflows on a user’s behalf — in beta today, off by default, and always with the user’s explicit consent. Beyond your product, the same approved knowledge layer is being built to serve outside consumers too — a hosted help portal, and access for third-party AI agents working on a user’s behalf. That third-party access is in development and not yet available; the road ahead page lays out the sequence.',
      },
      {
        q: 'Can FlowBuddy AI make my SaaS product easier for AI agents to understand and use?',
        a: 'That is the direction. Agents struggle with SaaS products for the same reason new users do: how a task is actually done is not written down anywhere. Recording your product produces exactly that missing description — approved, step by step, and true to your interface. The same knowledge base that helps your users today is what makes your product legible to agents later.',
      },
    ],
  },
];

/** Flat list, in page order — used for the FAQPage structured data. */
export const allPageFaqs: Faq[] = faqCategories.flatMap((c) => c.items);
