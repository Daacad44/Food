import type { Metadata } from 'next';
import './globals.css';
import './staff.css';
import './delivery.css';
import { StoreProvider } from '@/components/store';
export const metadata: Metadata = {
  title: { default: 'Botan · Delivery', template: '%s · Botan' },
  description: 'Botan Restaurant: dalab qaadashada iyo maareynta gaarsiinta (shaqaalaha kaliya).',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="so">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
