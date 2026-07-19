import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Bricolage_Grotesque, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

/** Clerk components themed to this app's warm-black/orange design tokens. */
const clerkAppearance = {
  variables: {
    colorBackground: "#1a1512",
    colorInputBackground: "#0f0c0a",
    colorText: "#faf6f0",
    colorTextSecondary: "#9c8b7a",
    colorPrimary: "#ff7a1a",
    colorInputText: "#faf6f0",
    colorDanger: "#f2627e",
    borderRadius: "11px",
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    card: { border: "1px solid #1a2530", boxShadow: "0 12px 40px rgba(0,0,0,0.55)" },
    formButtonPrimary: { color: "#04070a", fontWeight: 600 },
  },
};

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Content Management Dashboard",
  description: "Content Management Dashboard — approve, schedule, publish.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${bricolage.variable} ${archivo.variable} ${jetbrains.variable}`}
    >
      <body>
        {process.env.NEXT_PUBLIC_DISABLE_AUTH === "true" ? (
          // Local-dev escape hatch: boot without Clerk keys.
          <AppShell>{children}</AppShell>
        ) : (
          <ClerkProvider appearance={clerkAppearance}>
            <AppShell>{children}</AppShell>
          </ClerkProvider>
        )}
      </body>
    </html>
  );
}
