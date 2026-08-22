import "./globals.css";
import ThemeManager from "../components/ThemeManager";
import PageMotion from "../components/PageMotion";

export const metadata = {
  title: "WatchTogether — synced movie nights with friends",
  description: "Upload a movie or paste a link, invite friends, and watch in perfect sync.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen"><ThemeManager /><PageMotion>{children}</PageMotion></body>
    </html>
  );
}
