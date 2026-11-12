import { describe, expect, it } from "vitest";
import { analyseTermLines, lineAt, lineRange } from "./term-lines";

describe("analyseTermLines", () => {
  it("points each problem at its line and counts usable terms", () => {
    const result = analyseTermLines(['Sonic', '', '"Legend of Zelda', 'Mario, Zelda', '-'].join("\n"));
    expect(result.usableCount).toBe(4);
    expect(result.problems.map((p) => [p.line, p.term])).toEqual([
      [2, '"Legend of Zelda'],
      [4, "-"],
    ]);
    expect(result.problems[1]!.message).toMatch(/no words/);
  });

  it("treats Windows and old Mac line endings as line breaks", () => {
    expect(analyseTermLines("Sonic\r\n-\rMario").problems.map((p) => p.line)).toEqual([1]);
  });

  it("finds nothing in empty text", () => {
    expect(analyseTermLines("")).toEqual({ usableCount: 0, problems: [] });
  });
});

describe("line positions", () => {
  const text = "one\ntwo\nthree";

  it("gives a line's character range", () => {
    expect(lineRange(text, 1)).toEqual({ start: 4, end: 7 });
    expect(lineRange(text, 9)).toEqual({ start: 8, end: 13 });
  });

  it("finds the line holding an offset", () => {
    expect(lineAt(text, 0)).toBe(0);
    expect(lineAt(text, 5)).toBe(1);
    expect(lineAt(text, 13)).toBe(2);
  });
});
