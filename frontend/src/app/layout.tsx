import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { Providers } from './providers';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Allosta',
  description: '건강 상담 운영 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${newsreader.variable}`}
    >
      <body>
        <Theme
          accentColor="teal"
          grayColor="sage"
          radius="large"
          scaling="100%"
          panelBackground="solid"
        >
          <Providers>{children}</Providers>
        </Theme>
      </body>
    </html>
  );
}
