"use client";

// Last line of defence (the root layout itself failed): plain inline styles, no app CSS available.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "16px 16px 28px", background: "#E7EDE3", fontFamily: "-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif", color: "#1D1D1F" }}>
        <main style={{ width: "100%", maxWidth: 452, padding: "30px 22px 22px", borderRadius: 32, textAlign: "center", background: "rgba(250,250,252,0.9)", boxShadow: "0 12px 40px rgba(0,0,0,0.14)" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>Pathfinder hit a problem</h1>
          <p style={{ margin: "0 0 18px", color: "#48484A", lineHeight: 1.45 }}>Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ width: "100%", minHeight: 52, border: 0, borderRadius: 14, background: "#0071E3", color: "#fff", fontSize: 17, fontWeight: 600 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
