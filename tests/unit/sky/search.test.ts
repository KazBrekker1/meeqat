import { describe, expect, test } from "bun:test";
import { decodeSkyCatalog, type NamesFile } from "../../../app/utils/sky/catalog";
import { buildSearchIndex, normalize, search } from "../../../app/utils/sky/search";

const names = (await Bun.file("public/sky/names-v1.json").json()) as NamesFile;
const cat = decodeSkyCatalog(await Bun.file("public/sky/sky-v1.bin").arrayBuffer(), names);
const index = buildSearchIndex(cat);
const first = (q: string) => search(index, q)[0]?.en;

describe("normalize", () => {
  test("drops Latin accents and case", () => expect(normalize("  Bételgeuse ")).toBe("betelgeuse"));
  test("drops tashkeel and tatweel", () => expect(normalize("الشِّعْرَى")).toBe(normalize("الشعرى")));
  test("folds alef forms, alef maqsura and taa marbuta", () => {
    expect(normalize("أإآٱ")).toBe("اااا");
    expect(normalize("الشعرى")).toBe("الشعري");
    expect(normalize("المجرة")).toBe("المجره");
  });
});

describe("search", () => {
  test("English prefixes", () => {
    expect(first("veg")).toBe("Vega");
    expect(first("BETEL")).toBe("Betelgeuse");
    expect(first("jup")).toBe("Jupiter");
  });

  test("a constellation by name", () => {
    expect(search(index, "orion").map((i) => i.target.kind)).toContain("constellation");
  });

  test("Arabic, with or without tashkeel", () => {
    expect(first("الشعرى اليمانية")).toBe("Sirius");
    expect(first("الشِّعْرَى")).toBe("Sirius");
    expect(first("المشتري")).toBe("Jupiter");
  });

  test("a word inside an Arabic name finds both eagles, brighter first", () => {
    expect(search(index, "النسر").slice(0, 2).map((i) => i.en)).toEqual(["Vega", "Altair"]);
  });

  test("the Moon outranks fainter matches", () => expect(first("mo")).toBe("Moon"));
  test("empty query → nothing", () => expect(search(index, "   ")).toEqual([]));
  test("results are capped", () => expect(search(index, "a").length).toBeLessThanOrEqual(8));
});
