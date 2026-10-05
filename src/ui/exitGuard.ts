import type { Session } from '../core/tournament';

export const hasOngoingMatch = (session: Session | null) => !!session && !session.completed;
export function warnBeforeUnload(event: BeforeUnloadEvent, session: Session | null, desktop: boolean) {
  // Desktop owns its close lifecycle. Browsers choose the standard warning text
  // and may suppress it without a preceding user interaction.
  if (!desktop && hasOngoingMatch(session)) {
    event.preventDefault();
    event.returnValue = '';
  }
}
