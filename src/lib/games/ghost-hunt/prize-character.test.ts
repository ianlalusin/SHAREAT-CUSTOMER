import { describe, it, expect } from "vitest";
import { PACKS, prizeCharacter } from "@/components/games/ghost-hunt/packs";

const h = PACKS.halloween;
const name = (prizeId: string, i = 0) => prizeCharacter(h, prizeId, i).name;

describe("which ghost carries a Halloween prize", () => {
  it("keeps the four originals", () => {
    expect(name("melona")).toBe("Melona Multo");
    expect(name("coke")).toBe("Coca-Boo");
    expect(name("kimbap")).toBe("Kimbaboo");
    expect(name("enoki")).toBe("Enoki Wisp");
  });

  it("matches by word, since prize ids are slugs of whatever the admin typed", () => {
    expect(name("1-5l-coke")).toBe("Coca-Boo");
    expect(name("2-melona-ice-cream")).toBe("Melona Multo");
    expect(name("1-serving-gimbap")).toBe("Kimbaboo");
  });

  it("gives noodle prizes the noodle ghost", () => {
    for (const id of ["noodles", "1-serving-ramyeon", "ramen-bowl", "shin-ramyun", "pancit-canton"]) {
      expect(name(id)).toBe("Noodle Multo");
    }
  });

  it("never draws a new prize holding another prize's food — it gets the gift ghost", () => {
    for (const [id, i] of [["free-drink", 0], ["dessert-of-the-day", 1], ["mystery", 5]] as const) {
      expect(name(id, i)).toBe("Surprise Boo");
    }
  });

  it("gives Christmas prizes a carrier holding that food, and Santa's gift for the rest", () => {
    const x = (id: string, i = 0) => prizeCharacter(PACKS.christmas, id, i).name;
    expect(x("1-serving-ramyeon", 1)).toBe("Elfie");
    expect(x("1-5l-coke")).toBe("Santa");
    expect(x("enoki")).toBe("Rudolf");
    expect(prizeCharacter(PACKS.christmas, "mystery", 3).id).toBe("gift");
  });
});
