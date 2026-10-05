import { describe, it, expect } from "vitest";
import { takenTableCopy } from "../sharelebrator-link-copy";

describe("takenTableCopy", () => {
  it("tells the diner to ask the cashier when the cashier linked the card", () => {
    const c = takenTableCopy({ name: "Ana", byCashier: true });
    for (const text of [c.title, c.body, c.readOnly]) expect(text).toContain("cashier");
    expect(c.body).not.toMatch(/unlink/i);
    expect(c.readOnly).not.toMatch(/unlink/i);
    expect(c.body).toContain("Ana");
  });

  it("tells the diner to ask the cardholder to unlink when another diner linked it", () => {
    const c = takenTableCopy({ name: "Ben" });
    expect(c.body).toContain("Ask Ben to unlink");
    expect(c.title).toContain("Ben");
    expect(`${c.title} ${c.body} ${c.readOnly}`).not.toContain("cashier");
  });

  it("treats a missing byCashier as a diner link", () => {
    expect(takenTableCopy({ name: "Ben", byCashier: false })).toEqual(takenTableCopy({ name: "Ben" }));
  });
});
