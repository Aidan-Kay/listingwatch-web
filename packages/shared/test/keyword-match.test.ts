import { describe, expect, it } from "vitest";
import {
  analyseListText,
  analyseTerm,
  cleanTerms,
  compileList,
  countTerms,
  ListCompiler,
  matchTitle,
  MAX_TERM_VARIANTS,
  normalise,
  splitTerms,
} from "../src/keyword-match/index.ts";

/** Terms of a one-off list that `title` matches. */
function matches(title: string, terms: string[]): string[] {
  return matchTitle(title, [compileList({ id: "test", version: 1, terms })]);
}

const variantCount = (term: string): number => analyseTerm(term).compiled?.variants.length ?? 0;

describe("normalise", () => {
  it("strips diacritics, case and punctuation", () => {
    expect(normalise("Pokémon Écarlate")).toBe("pokemon ecarlate");
    expect(normalise("FIFA-21 (PS4)")).toBe("fifa 21 ps4");
    expect(normalise("  spaced   out  ")).toBe("spaced out");
  });
});

describe("loose matching", () => {
  it("matches when every token appears, in any order", () => {
    expect(matches("Paper Mario The Thousand Year Door", ["Paper Mario Thousand Year Door"])).toEqual(["Paper Mario Thousand Year Door"]);
    expect(matches("Mario Kart 8 Deluxe - Nintendo Switch", ["kart mario"])).toEqual(["kart mario"]);
  });

  it("tolerates extra words in the title", () => {
    expect(matches("Sealed Zelda Ocarina of Time N64 PAL", ["Ocarina of Time"])).toEqual(["Ocarina of Time"]);
  });

  it("never matches a prefix of a longer token", () => {
    expect(matches("Final Fantasy VIII", ["Final Fantasy VII"])).toEqual([]);
    expect(matches("Resident Evil 30th Anniversary", ["Resident Evil 3"])).toEqual([]);
    expect(matches("bicolour socks", ["ico"])).toEqual([]);
  });

  it("matches spacing variants through the squashed form", () => {
    expect(matches("FIFA21 for PS4", ["FIFA 21"])).toEqual(["FIFA 21"]);
    expect(matches("FIFA 21 for PS4", ["FIFA21"])).toEqual(["FIFA21"]);
  });

  it("reports every matching term", () => {
    expect(matches("Super Mario Kart Deluxe", ["mario", "kart", "sonic"]).sort()).toEqual(["kart", "mario"]);
  });

  it("matches nothing against an empty title", () => {
    expect(matches("—", ["zelda"])).toEqual([]);
  });
});

describe("alternation groups", () => {
  it("accepts | and , as separators", () => {
    expect(matches("Final Fantasy VII Remake", ["Final Fantasy (7|VII)"])).toEqual(["Final Fantasy (7|VII)"]);
    expect(matches("Final Fantasy 7 Remake", ["Final Fantasy (7,VII)"])).toEqual(["Final Fantasy (7,VII)"]);
    expect(matches("Final Fantasy IX", ["Final Fantasy (7|VII)"])).toEqual([]);
  });

  it("multiplies across groups", () => {
    expect(variantCount("(Res|Resident) Evil (2|II)")).toBe(4);
  });

  it("expands nested groups properly", () => {
    const term = "zelda (ocarina (3d|64)|majora)";
    expect(variantCount(term)).toBe(3);
    expect(matches("Zelda Ocarina 3D", [term])).toEqual([term]);
    expect(matches("Zelda Majora Mask", [term])).toEqual([term]);
    expect(matches("Zelda Ocarina GameCube", [term])).toEqual([]);
  });

  it("caps expansion and says so", () => {
    const wide = Array.from({ length: 8 }, () => "(a|b|c|d)").join(" ");
    const analysis = analyseTerm(wide);
    expect(analysis.compiled?.variants.length).toBeLessThanOrEqual(MAX_TERM_VARIANTS);
    expect(analysis.diagnostics.map((d) => d.code)).toContain("too-many-variants");
  });

  it("degrades an unclosed ( to plain words, with a warning", () => {
    expect(matches("Silent Hill 2001 edition", ["Silent Hill (2001"])).toEqual(["Silent Hill (2001"]);
    expect(analyseTerm("Silent Hill (2001").diagnostics.map((d) => d.code)).toEqual(["unclosed-group"]);
  });
});

describe("phrases", () => {
  it("requires the words together and in order", () => {
    expect(matches("The Legend of Zelda Breath of the Wild", ['"The Legend of Zelda"'])).toEqual(['"The Legend of Zelda"']);
    expect(matches("Zelda The Legend of", ['"The Legend of Zelda"'])).toEqual([]);
  });

  it("leaves words outside the quotes order-free", () => {
    const term = '"paper mario" thousand year door';
    expect(matches("Paper Mario The Thousand Year Door", [term])).toEqual([term]);
    expect(matches("Thousand Year Door Paper Mario", [term])).toEqual([term]);
    expect(matches("Mario Paper Thousand Year Door", [term])).toEqual([]);
  });

  it("degrades an unterminated quote to loose words, with a warning", () => {
    const term = '"paper mario thousand';
    expect(matches("Mario Paper Thousand", [term])).toEqual([term]);
    expect(analyseTerm(term).diagnostics.map((d) => d.code)).toEqual(["unterminated-quote"]);
  });
});

describe("exclusions", () => {
  it("rejects the term when an excluded word appears", () => {
    const term = "Super Mario Party -Jamboree";
    expect(matches("Super Mario Party - Nintendo Switch", [term])).toEqual([term]);
    expect(matches("Super Mario Party Jamboree", [term])).toEqual([]);
  });

  it("can exclude phrases and whole groups", () => {
    const phrase = 'Zelda -"breath of the wild"';
    expect(matches("Zelda Ocarina of Time", [phrase])).toEqual([phrase]);
    expect(matches("Zelda Breath of the Wild", [phrase])).toEqual([]);
    const group = "Super Mario Party -(Jamboree|Superstars)";
    expect(matches("Super Mario Party Deluxe", [group])).toEqual([group]);
    expect(matches("Super Mario Party Superstars", [group])).toEqual([]);
  });

  it("leaves hyphenated words and spaced dashes alone", () => {
    expect(matches("Spider-Man 2 PS5", ["Spider-Man 2"])).toEqual(["Spider-Man 2"]);
    expect(analyseTerm("Zelda - Ocarina").compiled?.excludes).toEqual([]);
  });

  it("only affects its own term", () => {
    expect(matches("Super Mario Party Jamboree", ["Mario Party -Jamboree", "Jamboree"])).toEqual(["Jamboree"]);
  });
});

describe("terms that can't match fail closed", () => {
  it.each(["()", "-Jamboree", '""'])("%s matches nothing and is flagged", (term) => {
    expect(matches("literally anything at all", [term])).toEqual([]);
    expect(analyseTerm(term).compiled).toBeNull();
  });

  it("treats a stray separator as punctuation", () => {
    expect(matches("literally anything at all", ["zelda|"])).toEqual([]);
    expect(matches("Zelda Link", ["zelda|"])).toEqual(["zelda|"]);
  });
});

describe("splitTerms and cleanTerms", () => {
  it("splits on newlines and top-level commas only", () => {
    expect(splitTerms("zelda\nmario")).toEqual(["zelda", "mario"]);
    expect(splitTerms("zelda, mario")).toEqual(["zelda", "mario"]);
    expect(splitTerms("final fantasy (7,VII)")).toEqual(["final fantasy (7,VII)"]);
    expect(splitTerms('"a, b"')).toEqual(['"a, b"']);
    expect(splitTerms("  \n zelda \r\n\n ")).toEqual(["zelda"]);
  });

  it("collapses case-insensitive duplicates, keeping the first spelling", () => {
    expect(cleanTerms([" Zelda ", "zelda", "", "Mario"])).toEqual(["Zelda", "Mario"]);
  });
});

describe("compiling lists", () => {
  it("drops terms that repeat an earlier one, but keeps ones with different exclusions", () => {
    const list = compileList({ id: "l", version: 1, terms: ["Mario Party", "mario  party", "Mario Party -Jamboree"] });
    expect(list.terms.map((t) => t.raw)).toEqual(["Mario Party", "Mario Party -Jamboree"]);
  });

  it("reuses a compiled list until its version changes", () => {
    const compiler = new ListCompiler();
    const first = compiler.compile({ id: "l", version: 1, terms: ["zelda"] });
    expect(compiler.compile({ id: "l", version: 1, terms: ["zelda"] })).toBe(first);
    const second = compiler.compile({ id: "l", version: 2, terms: ["mario"] });
    expect(second).not.toBe(first);
    expect(matchTitle("Mario Kart", [second])).toEqual(["mario"]);
  });

  it("counts usable terms across lists, ignoring missing ids", () => {
    const compiler = new ListCompiler();
    const lists = [
      { id: "a", version: 1, terms: ["zelda", "mario"] },
      { id: "b", version: 1, terms: ["sonic", "()"] },
    ];
    expect(countTerms(compiler.compileAll(["a", "b", "missing"], lists))).toBe(3);
    expect(countTerms(compiler.compileAll([], lists))).toBe(0);
  });
});

describe("analyseListText", () => {
  it("counts usable terms and flags problem ones", () => {
    const analysis = analyseListText('zelda\n-Jamboree\n"open quote\nmario');
    expect(analysis.usableCount).toBe(3);
    expect(analysis.flagged.map((t) => t.raw)).toEqual(["-Jamboree", '"open quote']);
  });
});
