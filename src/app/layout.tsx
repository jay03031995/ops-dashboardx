import type { Metadata } from 'next';
import './globals.css';
import { FloatingTeamChat } from '@/components/floating-team-chat';

export const metadata: Metadata = {
  title: 'GV - Ops Dashboard',
  description: 'GV operations admin and editor workflow dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <FloatingTeamChat />
      </body>
    </html>
  );
}
