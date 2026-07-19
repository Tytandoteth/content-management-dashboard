import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18, justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" width={22} height={22} style={{ borderRadius: 6, display: "block" }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)" }}>
            {process.env.NEXT_PUBLIC_BRAND_DISPLAY_NAME || "Your Brand"}
          </span>
        </div>
        <SignIn />
      </div>
    </div>
  );
}
