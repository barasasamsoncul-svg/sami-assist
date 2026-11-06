export default function RunnerApiHome() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#000535",
        color: "#FFFFFF",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section style={{ maxWidth: 520 }}>
        <p style={{ letterSpacing: 3, fontSize: 11, color: "#9EB9E8" }}>
          SAMI TECHNOLOGIES
        </p>
        <h1 style={{ fontSize: 34, marginBottom: 8 }}>SaMi Runner API</h1>
        <p style={{ color: "#D6E2F5", lineHeight: 1.6 }}>
          The independent Runner service is online. Check its health endpoint
          for database connectivity and schema readiness.
        </p>
        <code>/api/health</code>
      </section>
    </main>
  );
}