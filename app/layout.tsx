import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocSignSeal',
  description: 'E-signature and document sealing for institutions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
