// Single source for the FAQ section AND the FAQPage JSON-LD in the layout.
// `a` is plain text (used verbatim in structured data); keep it markup-free.
export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
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
    q: 'What does it cost?',
    a: 'FlowBuddy is free during early access. No credit card required — create an account, record your demo, and go live.',
  },
  {
    q: 'Is my data safe?',
    a: 'Sensitive data is masked in your browser while you record, before anything leaves your machine. The embed key is safe to include in your pages, works only on the domains you allow, and can be rotated at any time.',
  },
  {
    q: 'Does FlowBuddy work with AI agents?',
    a: 'That is where FlowBuddy is heading: the same approved knowledge base that powers your in-app assistant is being built to make your product usable by AI agents too. See flowbuddyai.com/future for the road ahead.',
  },
];
