import { describe, expect, it } from "vitest";
import { detectDateOrder, detectDelimiter, guessMapping, parseAmount, parseCsv, parseDate, parseStatement } from "./statement";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, newlines in quotes and a BOM", () => {
    const text = '﻿a,b,c\n"x, y","say ""hi""","line\nbreak"\r\n1,2,3\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line\nbreak"],
      ["1", "2", "3"],
    ]);
  });

  it("detects the separator", () => {
    expect(detectDelimiter("a;b;c\n1;2,5;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"x;y",b,c')).toBe(",");
  });
});

describe("parseAmount", () => {
  it.each([
    ["-12,99", -12.99],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["-1.234,56", -1234.56],
    ["12.99-", -12.99],
    ["(12.99)", -12.99],
    ["€ 12,99", 12.99],
    ["EUR -9.99", -9.99],
    ["1,234", 1234],
    ["12,5", 12.5],
    ["1 234,56", 1234.56],
    ["1'234.50", 1234.5],
    ["+2500.00", 2500],
    ["0", 0],
  ])("%s → %d", (raw, value) => {
    expect(parseAmount(raw)).toBe(value);
  });

  it("returns null for non-numbers", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("12a")).toBeNull();
  });
});

describe("dates", () => {
  it("works out day-first or month-first", () => {
    expect(detectDateOrder(["2026-07-03"])).toBe("ymd");
    expect(detectDateOrder(["03.07.2026", "25.07.2026"])).toBe("dmy");
    expect(detectDateOrder(["07/03/2026", "07/25/2026"])).toBe("mdy");
    expect(detectDateOrder(["03.07.26", "04.07.26"])).toBe("dmy");
  });

  it("parses each order, two-digit years and times", () => {
    expect(parseDate("2026-07-03 10:12:01", "ymd")).toBe("2026-07-03");
    expect(parseDate("03.07.26", "dmy")).toBe("2026-07-03");
    expect(parseDate("07/25/2026", "mdy")).toBe("2026-07-25");
    expect(parseDate("31.02.2026", "dmy")).toBeNull();
    expect(parseDate("soon", "dmy")).toBeNull();
  });
});

describe("real-world formats", () => {
  it("Revolut-style export", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-07-03 10:12:01,2026-07-04 09:00:00,Netflix,-13.99,0.00,EUR,COMPLETED,500.00",
      "TOPUP,Current,2026-07-05 08:00:00,2026-07-05 08:00:01,Top-up by *1234,100.00,0.00,EUR,COMPLETED,600.00",
    ].join("\n");
    const { transactions, mapping } = parseStatement(csv);
    expect(mapping).toMatchObject({ date: 3, description: [4], amount: 5 });
    expect(transactions).toEqual([
      { date: "2026-07-04", description: "Netflix", amount: -13.99 },
      { date: "2026-07-05", description: "Top-up by *1234", amount: 100 },
    ]);
  });

  it("German Sparkasse export with account details above the table", () => {
    const csv = [
      '"Umsätze Girokonto";"DE12 3456"',
      '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"',
      '"DE12";"03.07.26";"03.07.26";"FOLGELASTSCHRIFT";"Abo 12345";"Netflix International B.V.";"NL12";"";"-13,99";"EUR";"Umsatz gebucht"',
      '"DE12";"25.07.26";"25.07.26";"GEHALT";"Juli";"Arbeitgeber GmbH";"DE99";"";"2.450,00";"EUR";"Umsatz gebucht"',
    ].join("\n");
    const { transactions } = parseStatement(csv);
    expect(transactions).toEqual([
      { date: "2026-07-03", description: "Netflix International B.V. · Abo 12345", amount: -13.99 },
      { date: "2026-07-25", description: "Arbeitgeber GmbH · Juli", amount: 2450 },
    ]);
  });

  it("Lithuanian export with a D/K column", () => {
    const csv = [
      '"Sąskaitos Nr.";"";"Data";"Gavėjas";"Paaiškinimai";"Suma";"Valiuta";"D/K";"Įrašo ID"',
      '"LT12";"20";"2026-07-03";"NETFLIX.COM";"Netflix";"13.99";"EUR";"D";"1"',
      '"LT12";"20";"2026-07-10";"UAB Darbdavys";"Atlyginimas";"1500.00";"EUR";"K";"2"',
    ].join("\n");
    expect(parseStatement(csv).transactions).toEqual([
      { date: "2026-07-03", description: "NETFLIX.COM · Netflix", amount: -13.99 },
      { date: "2026-07-10", description: "UAB Darbdavys · Atlyginimas", amount: 1500 },
    ]);
  });

  it("US export with separate debit and credit columns", () => {
    const csv = [
      "Posting Date,Description,Debit,Credit,Balance",
      "07/03/2026,NETFLIX.COM 866-579-7172 CA,13.99,,1200.00",
      "07/15/2026,PAYROLL DEPOSIT,,2500.00,3700.00",
    ].join("\n");
    expect(parseStatement(csv).transactions).toEqual([
      { date: "2026-07-03", description: "NETFLIX.COM 866-579-7172 CA", amount: -13.99 },
      { date: "2026-07-15", description: "PAYROLL DEPOSIT", amount: 2500 },
    ]);
  });

  it("skips rows it can't read and reports files it can't map", () => {
    const csv = "Date,Description,Amount\n2026-07-03,Netflix,-13.99\nnot a date,Oops,-1\n2026-07-04,,-2";
    expect(parseStatement(csv)).toMatchObject({ skipped: 2, transactions: [{ description: "Netflix" }] });
    expect(parseStatement("foo,bar,baz\n1,2,3").mapping).toBeNull();
    expect(guessMapping(["Date", "Amount"])).toBeNull();
  });
});
