import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.6rem" }}>That card isn&apos;t here anymore</h1>
      <p style={{ margin: 0, color: "var(--muted)", maxWidth: "40ch" }}>
        Shared cards expire after 30 days. Make a fresh one — it takes a few seconds.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: "14px 28px",
          borderRadius: 999,
          background: "var(--accent)",
          color: "#08040f",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Make your card
      </Link>
    </main>
  );
}
