/** Owner notes for one event (wired up in phase 6). */
export function NotesSlot({ eventId }: { eventId: number }) {
  return <div data-notes-for={eventId} hidden />;
}
