import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="empty">
      <h1>404</h1>
      <p>Boggan lama helin.</p>
      <Link className="button" href="/login">
        Ku noqo bogga hore
      </Link>
    </main>
  );
}
