export default function Home() {
  return (
    <div className="wrap">
      <h1>Sync Help Portal</h1>
      <p className="lead">
        This is a multi-tenant help portal. Each workspace&apos;s help center lives at its own slug —
        visit <code>/your-workspace-slug</code> (in production, a subdomain).
      </p>
    </div>
  );
}
