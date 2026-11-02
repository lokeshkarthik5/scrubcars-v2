/**
 * The booked lines a final bill starts from. An add-on (`isAddon`, from the add-ons round) is
 * already paid for at booking and credited nowhere, so seeding the bill with it would charge it
 * twice. The same filter as `serviceLinesOf` in the web's final bill. The field is optional:
 * a booking that doesn't carry it behaves as before.
 */
export type BookedItem = { name: string; amount: number; isAddon?: boolean | null };

export const serviceLinesOf = <T extends object>(items: readonly T[]): T[] =>
  items.filter((item) => (item as { isAddon?: boolean | null }).isAddon !== true);

export function seedLines(items: readonly { name: string; amount: number }[], maxLines: number, maxDescription: number) {
  return serviceLinesOf(items)
    .slice(0, maxLines)
    .map((item) => ({ description: item.name.slice(0, maxDescription), amount: String(item.amount) }));
}
