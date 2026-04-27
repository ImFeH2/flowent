import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { defaultThemeMode, themeStorageKey } from "@/lib/theme";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const themeBootstrapScript = `(() => {
  try {
    const storedTheme = window.localStorage.getItem(${JSON.stringify(themeStorageKey)});
    const theme = storedTheme === "light" ? "light" : ${JSON.stringify(defaultThemeMode)};
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
  } catch {
    document.documentElement.classList.add(${JSON.stringify(defaultThemeMode)});
    document.documentElement.style.colorScheme = ${JSON.stringify(defaultThemeMode)};
  }
})();`;

export const metadata: Metadata = {
  title: "Flowent",
  description: "Flowent application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(defaultThemeMode, "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
