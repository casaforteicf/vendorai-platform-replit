/** Pure representation of the pre-existing calendar publication guard.
 * This is not an atomic lock; concurrent requests still require DB reservation.
 */
export type ExistingCalendarPublication = { id: string; status: string };
export type CalendarPublicationConflict = {
  error: "calendar_publication_already_exists";
  publicationId: string;
  status: string;
};
export function calendarPublicationConflict(
  existing: ExistingCalendarPublication | null | undefined,
): CalendarPublicationConflict | null {
  if (!existing) return null;
  return {
    error: "calendar_publication_already_exists",
    publicationId: existing.id,
    status: existing.status,
  };
}
