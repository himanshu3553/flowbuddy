import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sync Studio',
  description: 'Record once. Self-maintaining knowledge base.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
