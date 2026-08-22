import { createFileRoute } from "@tanstack/react-router";
import { LyricsApp } from "@/components/lyrics-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="min-h-dvh bg-bg">
      <LyricsApp />
    </main>
  );
}
