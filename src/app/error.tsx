'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h1>Waxbaa qaldamay</h1>
      <p>Mar kale isku day. Dalabkaaga dib looma samaynayo.</p>
      <button onClick={reset}>Dib u isku day</button>
    </main>
  );
}
