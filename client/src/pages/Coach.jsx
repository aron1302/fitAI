import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";

const SUGGESTIONS = [
  "How much protein should I eat?",
  "I'm sore today — should I still train?",
  "Change my workout split to a bro split",
  "Make my meal plan vegetarian",
];

export default function Coach() {
  // The conversation and busy state live in AppContext so a streaming reply
  // keeps running in the background when the user switches pages and returns.
  const { profile, coachMessages: messages, coachBusy: busy, sendCoachMessage } = useApp();
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, busy]);

  function send(text) {
    sendCoachMessage(text ?? input);
    setInput("");
  }

  const lastEmpty = busy && messages[messages.length - 1]?.content === "";

  return (
    <>
      <div className="page-head">
        <h1>AI Coach</h1>
        <p>Personalised advice grounded in your profile and today's numbers.</p>
        <p className="ai-disclosure">
          Your messages and profile are sent to the configured AI provider to generate replies, and
          this is general information, not medical advice. See{" "}
          <Link to="/legal/privacy">Privacy</Link> &amp;{" "}
          <Link to="/legal/health">Health Disclaimer</Link>.
        </p>
      </div>

      <div className="chat-wrap">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg-row ${m.role}`}>
              <span className={`msg-avatar ${m.role}`} aria-hidden="true">
                {m.role === "assistant" ? "AI" : profile.name?.trim()?.[0]?.toUpperCase() || "Y"}
              </span>
              <div className={`msg ${m.role}`}>
                {m.content ||
                  (i === messages.length - 1 && lastEmpty ? (
                    <span className="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    ""
                  ))}
              </div>
            </div>
          ))}
        </div>

        {messages.length <= 1 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your coach anything…"
            disabled={busy}
          />
          <button className="btn" type="submit" disabled={busy || !input.trim()}>
            {busy ? <span className="spinner" /> : "Send"}
          </button>
        </form>
      </div>
    </>
  );
}
