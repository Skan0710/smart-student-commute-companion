import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Sparkles, Navigation, AlertCircle, ArrowRight } from 'lucide-react';
import { request } from '../services/api';
import AiFormattedText from './ui/AiFormattedText';

const QUICK_PROMPTS = [
  'How to reach DJSCE from Vikhroli?',
  'How do I scan my timetable image?',
  'What bus goes to Vile Parle / Irla?',
  'Are there waterlogging delay alerts?'
];

const INITIAL_MESSAGES = [
  {
    id: 'welcome-msg',
    sender: 'bot',
    text: `👋 Hey! I'm your **Campus & Transit Assistant**.

I can help with:
• **Routes to DJ Sanghvi** (Buses like A-422, Western Local trains, Metro)
• **Timetable OCR scanning** tips & Schedule setup
• **Transit advisories** & monsoon rain updates

Ask me anything or tap a question below!`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
];

function renderInlineFormatting(text) {
  if (!text) return null;

  // Split by inline markdown tokens: `code`, **bold**, *italic*, [text](url)
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-blue-600 dark:text-blue-400 border border-slate-200/60 dark:border-slate-700/60 break-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={i} className="italic text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline font-medium hover:text-blue-700"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderFormattedMessage(rawText) {
  if (!rawText) return null;
  const text = typeof rawText === 'string' ? rawText : String(rawText);
  const lines = text.split('\n');

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={idx} className="h-1.5" />;
    }

    // Headers: #, ##, ###, ####
    if (trimmed.startsWith('#')) {
      const headerText = trimmed.replace(/^#+\s*/, '');
      return (
        <div
          key={idx}
          className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white pt-2 pb-1 border-b border-slate-100 dark:border-slate-800/80 mb-1"
        >
          {renderInlineFormatting(headerText)}
        </div>
      );
    }

    // Numbered list: 1. , 2. , 3.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const num = numMatch[1];
      const rest = numMatch[2];
      return (
        <div key={idx} className="flex items-start gap-2.5 my-1 pl-0.5">
          <span className="shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center mt-0.5">
            {num}
          </span>
          <div className="flex-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
            {renderInlineFormatting(rest)}
          </div>
        </div>
      );
    }

    // Bullet points: •, -, *, +
    const bulletMatch = trimmed.match(/^([•\-\*\+])\s+(.*)$/);
    if (bulletMatch) {
      const rest = bulletMatch[2];
      return (
        <div key={idx} className="flex items-start gap-2 my-1 pl-0.5">
          <span className="text-blue-600 dark:text-blue-400 font-bold text-sm leading-none mt-0.5 shrink-0">•</span>
          <div className="flex-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
            {renderInlineFormatting(rest)}
          </div>
        </div>
      );
    }

    // Standard paragraph
    return (
      <p key={idx} className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed my-0.5 break-words">
        {renderInlineFormatting(trimmed)}
      </p>
    );
  });
}

export default function CampusChatbot({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages]);

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: query })
      });

      const botReply = res?.reply || 'I am ready to help with your commute, timetable scanning, and study schedule.';

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: botReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      // Local fallback
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-fallback-${Date.now()}`,
          sender: 'bot',
          text: `**DJSCE Transit Quick Guide:**
• **From Vikhroli/Powai**: Take BEST bus **A-422** to *Erla / Cooper Hospital*, then walk 400m to DJ Sanghvi.
• **From Western Line**: Vile Parle Station (West) is an 8–10 minute walk or ₹23 auto ride to campus.
• **Schedule & Timetable**: Click the **Schedule** tab and use **"Got a TimeTable? Upload it"** to auto-extract your classes!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close Campus Assistant' : 'Open Campus Transit & Academic Assistant'}
        aria-expanded={isOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-[#800020] hover:bg-[#66001a] dark:bg-[#0047ff] dark:hover:bg-[#0038cc] text-white shadow-xl hover:shadow-2xl transition-all duration-200 active:scale-95 group focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
      >
        <div className="relative">
          <Bot className="w-5 h-5 text-white" aria-hidden="true" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#ccff00] rounded-full border-2 border-[#800020] dark:border-[#0047ff] animate-pulse" />
        </div>
        <span className="text-xs font-bold tracking-wide">Campus Bot</span>
      </button>

      {/* Floating Chat Modal Window */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Campus Transit and Academic Chatbot"
          className="fixed bottom-20 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-[420px] h-[580px] max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-[#0c0f1e] border border-slate-200/90 dark:border-slate-800 shadow-2xl overflow-hidden font-sans backdrop-blur-xl animate-fade-in"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#800020] via-[#5c0017] to-[#4a5247] dark:from-[#0047ff] dark:via-[#002f99] dark:to-[#070b18] text-white flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
                <Bot className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 leading-none !text-white text-white">
                  <span className="!text-white text-white font-bold tracking-tight">Campus &amp; Transit Assistant</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                </h3>
                <p className="text-[11px] !text-white/90 text-white/90 mt-1 font-normal">DJSCE Commute, OCR &amp; Academic Guide</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 !text-white text-white transition-colors"
            >
              <X className="w-4 h-4 !text-white text-white" />
            </button>
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 overflow-x-auto no-scrollbar shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-slate-700 dark:text-slate-300 transition-all shadow-2xs font-medium"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 dark:bg-slate-950/40">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[88%] rounded-2xl px-4 py-3 shadow-2xs break-words ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-bl-xs text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {msg.sender === 'user' ? (
                    <p className="text-xs sm:text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <AiFormattedText text={msg.text} className="text-xs sm:text-sm" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 px-1 mt-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-2xl max-w-[150px] shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                <span>Checking transit…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white dark:bg-[#0c0f1e] border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about routes, A-422 bus, timetable..."
              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-all shadow-xs shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
