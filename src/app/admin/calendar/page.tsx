import { redirect } from 'next/navigation';

export default function AdminCalendarRedirectPage() {
  redirect('/admin/task-board');
}
