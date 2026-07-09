import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// The two voices of the signals desk: Newsreader carries headlines and the
// italic "why" asides; Plex Mono is the instrument face for everything
// measured. Self-hosted via next/font — no CDN, no layout shift.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "AI Media Radar",
  description: "Trending AI papers, articles, and discussions",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Radar",
  },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e17" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Applies the stored theme before first paint so there is no flash.
// "auto" (or nothing stored) follows the OS.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('radar:theme');var d=t==='dark'||((!t||t==='auto')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}`,
          }}
        />
      </body>
    </html>
  );
}
