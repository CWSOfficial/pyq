import "./globals.css";

export const metadata = {
  title: "PYQ Cloud | Keep learning. Keep growing.",
  description: "A calm, focused home for your previous-year question practice.",
  applicationName: "PYQ Cloud",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "PYQ Cloud", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080d",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}<script src="/register-sw.js?v=4" defer /></body></html>;
}
