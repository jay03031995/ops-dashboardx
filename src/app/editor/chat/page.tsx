import { TeamChatPanel } from '@/components/team-chat-panel';

export default function EditorChatPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Taskboard Chat</h1>
        <p className="text-sm text-slate-500">Discuss tasks with the team and tag assignments.</p>
      </div>
      <TeamChatPanel calendarLink="/editor/dashboard" />
    </div>
  );
}
