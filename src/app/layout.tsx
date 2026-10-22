import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/components/store';
export const metadata: Metadata = {
  title: { default: 'Botan Restaurant · Cunto fiican. Nolol fiican.', template: '%s · Botan' },
  description:
    'Cunto cusub, dhadhan Soomaali iyo adeeg aad ku kalsoon tahay. Dalbo Botan Restaurant.',
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
