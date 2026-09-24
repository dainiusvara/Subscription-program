/**
 * Splitting shared subscriptions within a family: everyone pays an equal
 * share, and the balance says who is owed money by whom each month.
 */
import { monthlyEquivalent } from "./billing";
import type { Subscription } from "./types";

export interface SharedSubscription extends Subscription {
  /** Who is charged for it. */
  ownerId: string;
}

export interface MemberSplit {
  userId: string;
  /** Monthly cost of the shared subscriptions this person is charged for. */
  pays: number;
  /** Their equal share of all shared subscriptions, per month. */
  share: number;
  /** pays − share. Positive: the others owe them. Negative: they owe the others. */
  balance: number;
}

export interface FamilySplit {
  totalMonthly: number;
  members: MemberSplit[];
}

/** Monthly cost of a shared subscription right now (free trials cost nothing yet). */
function monthly(sub: Subscription): number {
  return sub.trial ? 0 : monthlyEquivalent(sub.price, sub.cycle);
}

export function familySplit(shared: readonly SharedSubscription[], memberIds: readonly string[]): FamilySplit {
  const totalMonthly = shared.reduce((sum, sub) => sum + monthly(sub), 0);
  const share = memberIds.length > 0 ? totalMonthly / memberIds.length : 0;
  return {
    totalMonthly,
    members: memberIds.map((userId) => {
      const pays = shared.filter((s) => s.ownerId === userId).reduce((sum, sub) => sum + monthly(sub), 0);
      return { userId, pays, share, balance: pays - share };
    }),
  };
}

/** Each subscription's cost per person. */
export function perPerson(sub: Subscription, memberCount: number): number {
  return memberCount > 0 ? monthly(sub) / memberCount : monthly(sub);
}
