"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui", padding: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Internal Error</h2>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Something went wrong while loading the app.
        </p>

        <pre
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f4f4f5",
            borderRadius: 12,
            overflow: "auto",
            maxWidth: 900,
          }}
        >
          {String(error?.message || error)}
        </pre>

        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e4e4e7",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
