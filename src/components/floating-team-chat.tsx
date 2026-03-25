'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { TeamChatPanel } from './team-chat-panel';

export function FloatingTeamChat() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-4 w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="relative bg-slate-800 px-4 pb-6 pt-4 text-center text-white">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1 text-white/70 hover:bg-white/10"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-xs uppercase tracking-wider text-white/70">Send a message</div>
            <div className="mt-4 flex justify-center">
              <div className="-space-x-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-800 shadow-md">SM</div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-800 shadow-md">VE</div>
              </div>
            </div>
            <div className="mt-3 text-lg font-semibold">How can we help?</div>
            <div className="text-xs text-white/70">We usually respond in a few hours</div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <TeamChatPanel calendarLink="/admin/task-board" compact variant="widget" />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
        aria-label="Open team chat"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    </div>
  );
}
