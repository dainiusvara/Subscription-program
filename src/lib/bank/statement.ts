/**
 * Reading bank statement exports (CSV). Every bank formats these differently:
 * commas or semicolons, "1.234,56" or "1,234.56", day-first or month-first
 * dates, column names in many languages. This file turns them into a plain
 * list of transactions. It runs in the browser; the file is never uploaded.
 */
import type { ISODate } from "../types";

export interface Transaction {
  date: ISODate;
  description: string;
  /** Negative for money going out. */
  amount: number;
}

/** Which columns hold what. Indexes into the header row. */
export interface ColumnMapping {
  date: number;
  /** One or more columns joined into the description (e.g. payee + purpose). */
  description: number[];
  amount: number | null;
  /** Separate money-out / money-in columns, for banks that use them instead of a signed amount. */
  debit: number | null;
  credit: number | null;
  /** A column saying D/K, D/C, Debit/Credit, S/H. */
  direction: number | null;
}

export interface ParsedStatement {
  headers: string[];
  mapping: ColumnMapping | null;
  transactions: Transaction[];
  /** Rows that couldn't be read (bad date or amount). */
  skipped: number;
}

/* ------------------------------------------------------------------------ */
/* CSV                                                                       */
/* ------------------------------------------------------------------------ */

/** The separator used in the file: comma, semicolon or tab. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const counts = [",", ";", "\t"].map((d) => ({ d, n: countOutsideQuotes(sample, d) }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

function countOutsideQuotes(text: string, char: string): number {
  let inQuotes = false;
  let n = 0;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === char && !inQuotes) n++;
  }
  return n;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

/* ------------------------------------------------------------------------ */
/* Amounts and dates                                                         */
/* ------------------------------------------------------------------------ */

/**
 * "-12,99", "1.234,56", "1,234.56", "12.99-", "(12.99)", "€ 12,99", "EUR -9.99" → number.
 * Returns null when there's no number.
 */
export function parseAmount(raw: string): number | null {
  let text = raw.replace(/\s| /g, "").replace(/[€$£]|EUR|USD|GBP/gi, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^[\d.,']+$/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal separator.
    normalized = lastComma > lastDot ? text.replace(/[.']/g, "").replace(",", ".") : text.replace(/[,']/g, "");
  } else if (lastComma > -1) {
    // "12,99" and "12,5" are decimals; "1,234" and "1,234,567" are thousands.
    const commas = (text.match(/,/g) ?? []).length;
    const decimals = text.length - lastComma - 1;
    normalized = commas > 1 || decimals === 3 ? text.replace(/,/g, "") : text.replace(",", ".");
  } else {
    normalized = text.replace(/'/g, "");
    // "1.234.567" has several dots: thousands.
    if ((normalized.match(/\./g) ?? []).length > 1) normalized = normalized.replace(/\./g, "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export type DateOrder = "ymd" | "dmy" | "mdy";

const DATE_PATTERN = /^(\d{1,4})[./\-](\d{1,2})[./\-](\d{1,4})/;

/**
 * Works out whether a column of dates is day-first or month-first by looking
 * for a value above 12. Year-first dates are unambiguous.
 */
export function detectDateOrder(samples: readonly string[]): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  let slash = 0;
  for (const sample of samples) {
    const m = DATE_PATTERN.exec(sample.trim());
    if (!m) continue;
    if (m[1].length === 4) return "ymd";
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) dayFirst++;
    if (b > 12) monthFirst++;
    if (sample.includes("/")) slash++;
  }
  if (dayFirst > 0 && monthFirst === 0) return "dmy";
  if (monthFirst > 0 && dayFirst === 0) return "mdy";
  // Can't tell: slashes are usually US-style, dots and dashes European.
  return slash > samples.length / 2 && dayFirst === 0 ? "mdy" : "dmy";
}

export function parseDate(raw: string, order: DateOrder): ISODate | null {
  const m = DATE_PATTERN.exec(raw.trim());
  if (!m) return null;
  let year: number;
  let month: number;
  let day: number;
  if (order === "ymd" || m[1].length === 4) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (order === "dmy") {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------------ */
/* Columns                                                                   */
/* ------------------------------------------------------------------------ */

/** Header words by preference, in the languages of Drip's likely users. */
const DATE_WORDS = [
  "completed date", "booking date", "buchungstag", "transaction date", "posting date", "date", "datum", "data",
  "fecha", "datums", "kuupaev", "transaktionsdatum", "bokforingsdag", "operacijos data", "data operacji",
  "valutadatum", "value date", "started date",
];
const PAYEE_WORDS = [
  "payee", "merchant", "counterparty", "beneficiary", "beguenstigter", "zahlungspflichtiger", "empfanger",
  "auftraggeber", "name", "gavejas", "moketojas", "gavejas moketojas", "sanemejs", "saaja", "naam", "recipient",
];
const PURPOSE_WORDS = [
  "description", "details", "verwendungszweck", "beschreibung", "buchungstext", "paaiskinimai", "moketojo paskirtis",
  "paskirtis", "narration", "memo", "reference", "libelle", "concepto", "descrizione", "omschrijving", "tekst",
  "selgitus", "text", "meddelande", "tytul",
];
const AMOUNT_WORDS = ["amount", "betrag", "suma", "summa", "importe", "montant", "importo", "bedrag", "kwota", "belopp", "summe"];
const DEBIT_WORDS = ["debit", "money out", "paid out", "withdrawal", "soll", "islaidos", "ausgang"];
const CREDIT_WORDS = ["credit", "money in", "paid in", "deposit", "haben", "pajamos", "eingang"];
const DIRECTION_WORDS = ["d k", "d c", "debit credit", "credit debit", "dr cr", "s h", "soll haben", "debit credit indicator"];

function normalizeHeader(header: string): string {
  return header
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumn(headers: string[], words: readonly string[], taken: Set<number>, exact = false): number | null {
  const normalized = headers.map(normalizeHeader);
  for (const word of words) {
    const index = normalized.findIndex(
      (h, i) => !taken.has(i) && (h === word || (!exact && (` ${h} `.includes(` ${word} `)))),
    );
    if (index !== -1) return index;
  }
  return null;
}

/** Guesses the columns from the header row. Null when there's no date or amount column. */
export function guessMapping(headers: string[]): ColumnMapping | null {
  const taken = new Set<number>();
  const direction = findColumn(headers, DIRECTION_WORDS, taken, true);
  if (direction !== null) taken.add(direction);
  const date = findColumn(headers, DATE_WORDS, taken);
  if (date === null) return null;
  taken.add(date);

  const amount = findColumn(headers, AMOUNT_WORDS, taken);
  if (amount !== null) taken.add(amount);
  const debit = amount === null ? findColumn(headers, DEBIT_WORDS, taken) : null;
  if (debit !== null) taken.add(debit);
  const credit = amount === null ? findColumn(headers, CREDIT_WORDS, taken) : null;
  if (credit !== null) taken.add(credit);
  if (amount === null && debit === null) return null;

  const description: number[] = [];
  const payee = findColumn(headers, PAYEE_WORDS, taken);
  if (payee !== null) {
    description.push(payee);
    taken.add(payee);
  }
  const purpose = findColumn(headers, PURPOSE_WORDS, taken);
  if (purpose !== null) description.push(purpose);
  if (description.length === 0) return null;

  return { date, description, amount, debit, credit, direction };
}

/** Banks put account details above the table: the header is the first row that maps. */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if (rows[i].length >= 3 && guessMapping(rows[i])) return i;
  }
  return -1;
}

function isDebitMarker(value: string): boolean {
  return /^(d|dr|debit|s|soll|debet|out)$/i.test(value.trim());
}

/** Reads a statement. Pass a mapping to override the guessed columns. */
export function parseStatement(text: string, override?: ColumnMapping): ParsedStatement {
  const rows = parseCsv(text);
  const headerRow = findHeaderRow(rows);
  const headers = headerRow >= 0 ? rows[headerRow] : (rows[0] ?? []);
  const mapping = override ?? (headerRow >= 0 ? guessMapping(headers) : null);
  if (!mapping) return { headers, mapping: null, transactions: [], skipped: 0 };

  const body = rows.slice(Math.max(headerRow, 0) + 1);
  const order = detectDateOrder(body.map((r) => r[mapping.date] ?? "").slice(0, 200));
  const transactions: Transaction[] = [];
  let skipped = 0;

  for (const row of body) {
    const date = parseDate(row[mapping.date] ?? "", order);
    let amount: number | null = null;
    if (mapping.amount !== null) {
      amount = parseAmount(row[mapping.amount] ?? "");
      if (amount !== null && mapping.direction !== null) {
        amount = isDebitMarker(row[mapping.direction] ?? "") ? -Math.abs(amount) : Math.abs(amount);
      }
    } else {
      const out = mapping.debit !== null ? parseAmount(row[mapping.debit] ?? "") : null;
      const inn = mapping.credit !== null ? parseAmount(row[mapping.credit] ?? "") : null;
      if (out) amount = -Math.abs(out);
      else if (inn) amount = Math.abs(inn);
    }
    const description = mapping.description
      .map((i) => row[i] ?? "")
      .filter(Boolean)
      .join(" · ");
    if (!date || amount === null || !description) {
      skipped++;
      continue;
    }
    transactions.push({ date, description, amount });
  }
  return { headers, mapping, transactions, skipped };
}
