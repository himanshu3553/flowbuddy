// Single source for the FAQ section AND the FAQPage JSON-LD in the layout.
// `a` is plain text (used verbatim in structured data); keep it markup-free.
export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: 'What is an application intelligence layer?',
    a: 'A layer that sits on top of your product and understands how the product itself works — its workflows, its concepts, and its screens. FlowBuddy builds that layer from one recorded walkthrough, you approve what goes into it, and the same approved layer then powers in-app answers, contextual guidance, interactive onboarding, and AI agent execution.',
  },
  {
    q: 'How long does setup really take?',
    a: 'About as long as one product demo. You click through your product once while the FlowBuddy recorder watches, approve the workflows it creates, and paste one snippet into your app. Most products can go live in around 30 minutes.',
  },
  {
    q: 'Do I need developers to set it up?',
    a: 'No. Recording and approving happen in your browser, and going live is pasting one small script tag into your app — the kind of change anyone who can edit your site can make. There is no SDK to integrate and no code to write.',
  },
  {
    q: 'Will the assistant make things up?',
    a: 'No. It only answers from the workflows you recorded and approved, and it shows where each answer comes from. When it does not know something, it says so honestly instead of guessing — and flags the gap so you know what to record next.',
  },
  {
    q: 'How does FlowBuddy learn my product?',
    a: 'You give it a demo. A Chrome recorder watches you click through your product — like showing a new teammate around — and FlowBuddy automatically turns that session into product knowledge and step-by-step workflows for you to review and approve.',
  },
  {
    q: 'Will it change how my product looks?',
    a: 'No. The assistant is a small floating helper that sits on top of your product. It never moves, resizes, or restyles anything on your pages, and you can match its accent color to your brand.',
  },
  {
    q: 'Is my data safe?',
    a: 'Sensitive data is masked in your browser while you record, before anything leaves your machine. The embed key is safe to include in your pages, works only on the domains you allow, and can be rotated at any time.',
  },
  {
    q: 'Can the assistant actually do tasks for my users?',
    a: 'Yes — in beta. With AI Agent Execution switched on, the assistant can carry out an approved workflow itself: filling fields, clicking through steps, and narrating as it goes. It is off by default, every run starts with your user’s explicit consent, the user can stop it at any time, and the outcome is verified before it says done.',
  },
  {
    q: 'Does FlowBuddy work with AI agents?',
    a: 'In two ways. Today, FlowBuddy’s own agent can carry out approved workflows inside your product — in beta, off by default, and only ever with your user’s consent. Next, the same approved knowledge layer is being built to serve outside AI agents working on a user’s behalf. See flowbuddyai.com/future for the road ahead.',
  },
];
