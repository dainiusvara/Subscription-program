/**
 * A made-up bank statement for "Try with a sample file": seven months of a
 * typical account, dated relative to today so the results always look current.
 */
import { addDays, addMonths } from "../billing";
import type { ISODate } from "../types";

export function sampleStatement(today: ISODate): string {
  const rows: [ISODate, string, string, number][] = [];
  const add = (date: ISODate, payee: string, details: string, amount: number) => {
    if (date <= today) rows.push([date, payee, details, amount]);
  };
  const start = addMonths(today, -7);

  for (let m = 0; m <= 7; m++) {
    const month = addMonths(start, m);
    const day = (n: number) => `${month.slice(0, 8)}${String(n).padStart(2, "0")}`;
    add(day(3), "NETFLIX.COM", "Card payment 4921******1234 Amsterdam", -13.99);
    add(day(9), "Spotify", "SPOTIFY P2A3B4C5D Stockholm", -11.99);
    add(day(14), "FitZone Vilnius", "Direct debit membership", -29.0);
    add(day(18), "APPLE.COM/BILL", "iCloud+ ITUNES.COM", -2.99);
    add(day(21), "GOOGLE *YouTubePremium", "g.co/helppay", -13.99);
    add(day(25), "Employer UAB", "Salary", 2450);
    if (m < 4) add(day(12), "Xbox Game Pass", "MICROSOFT*XBOX", -14.99);
    // Everyday spending: different shops and amounts, no pattern.
    for (let k = 0; k < 6; k++) {
      const amount = -Math.round(((m * 7 + k * 13) % 50) * 100 + 850) / 100;
      add(addDays(day(1), k * 5 + (m % 3)), ["Maxima", "Rimi", "Lidl", "Bolt Food", "Circle K", "IKI"][k], "Card payment", amount);
    }
  }
  rows.sort((a, b) => b[0].localeCompare(a[0]));
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map(([date, payee, details, amount]) =>
    [date, quote(payee), quote(details), amount.toFixed(2), "EUR"].join(","),
  );
  return ["Date,Payee,Details,Amount,Currency", ...lines].join("\n");
}
