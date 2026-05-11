"use client";

import { useEffect, useRef, useState } from "react";
import { apiChat, type ChatMessage, type ChatResponse } from "@/lib/api";

type AISidebarProps = {
  onMutation: (resp: ChatResponse) => void;
  onClose: () => void;
};

export const AISidebar = ({ onMutation, onClose }: AISidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const resp = await apiChat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: resp.message }]);
      if (resp.new_cards?.length || resp.update_cards?.length || resp.delete_card_ids?.length) {
        onMutation(resp);
      }
    } catch {
      setError("Failed to reach AI. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-screen w-[400px] max-w-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            AI Assistant
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--navy-dark)]">
            Ask me to update your board
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI sidebar"
          className="flex items-center justify-center rounded-lg border border-[var(--stroke)] p-2 text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <p className="text-center text-xs text-[var(--gray-text)]">
            Ask me to add, move, rename, or delete cards — or just ask a question.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "ml-8 self-end rounded-2xl rounded-br-sm bg-[var(--secondary-purple)] px-4 py-2.5 text-sm text-white"
                : "mr-8 self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--navy-dark)]"
            }
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div
            aria-label="AI is thinking"
            className="mr-8 self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--gray-text)]"
          >
            Thinking…
          </div>
        )}
        {error && (
          <p className="text-center text-xs font-semibold text-red-500">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--stroke)] px-4 py-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            placeholder="Message the AI…"
            disabled={loading}
            className="flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-50"
            aria-label="AI message input"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
};
