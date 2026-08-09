import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

import { Toaster } from '@/components/ui/toast';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FlowBuddy Studio',
  description: 'Record once. Self-maintaining knowledge base.',
};

// Dogfood: FlowBuddy's own copilot embedded on Studio itself, as a plain customer install —
// the exact three-attribute snippet the Copilot page tells customers to paste, nothing bespoke.
// Off unless the founder sets the key AND a real widget src (no placeholder script tags).
function DogfoodWidget() {
  const key = process.env.FLOWBUDDY_DOGFOOD_WIDGET_KEY;
  const src = process.env.FLOWBUDDY_WIDGET_URL;
  if (!key || !src) return null;
  const api = process.env.FLOWBUDDY_API_URL || 'http://localhost:8787';
  return <script async src={src} data-flowbuddy-api={api} data-flowbuddy-key={key} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <Toaster />
        <DogfoodWidget />
      </body>
    </html>
  );
}
