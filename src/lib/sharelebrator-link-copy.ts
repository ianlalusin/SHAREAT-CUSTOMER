/**
 * Wording for a table whose Sharelebrator card belongs to someone else.
 *
 * The one thing it must get right is WHO the diner has to ask: a diner link
 * can be unlinked by that diner, but a cashier link can only be changed by the
 * cashier (the unlink route refuses everyone else) — telling a diner to "ask
 * them to unlink" a card the cashier linked sends them nowhere.
 */

export type TakenTable = { name: string; byCashier?: boolean };

export function takenTableCopy({ name, byCashier }: TakenTable) {
  if (byCashier) {
    return {
      title: "This table was linked by the cashier",
      body: `The cashier linked this table to ${name}'s card, so this meal earns points for them. Only the cashier can change it — ask the cashier if it should be on your card instead.`,
      readOnly: `The cashier linked this table to ${name}'s card, so this meal is earning points for them and nothing here will change tonight. Ask the cashier if that's not right.`,
    };
  }
  return {
    title: `This table is already using ${name}'s card`,
    body: `A session can hold one Sharelebrator card, and this one earns points for ${name}. Ask ${name} to unlink it if you'd like this meal on your card instead.`,
    readOnly: `This meal is earning points for ${name}'s card, so nothing here will change tonight.`,
  };
}
