import { afterAll, describe, expect, it } from "vitest";
import { adminClient, newUser } from "@/test/db";
import { toRow } from "./cloud";
import { createFamily, joinFamily, leaveFamily, loadFamily, removeMember, renewInviteCode } from "./family";
import { pullAccount } from "./sync";
import type { Subscription } from "./types";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await adminClient().auth.admin.deleteUser(id);
});

async function user(label: string, pro = false) {
  const u = await newUser(label);
  created.push(u.id);
  if (pro) await adminClient().from("profiles").update({ pro_preview: true }).eq("id", u.id);
  return u;
}

function sub(name: string, price = 12): Subscription {
  return {
    id: crypto.randomUUID(), name, price, cycle: "month", nextCharge: "2026-10-01", billingDay: 1,
    category: "Streaming", color: "#7A3B8F", used: true, trial: false,
  };
}

/** A Pro owner with a family, plus a member who joined with the code. */
async function family() {
  const owner = await user("owner", true);
  const member = await user("member");
  expect(await createFamily(owner.client, "  The Smiths ")).toEqual({ ok: true, value: undefined });
  const fam = (await loadFamily(owner.client))!;
  expect(await joinFamily(member.client, ` ${fam.inviteCode.toLowerCase()} `)).toEqual({ ok: true, value: undefined });
  return { owner, member, fam };
}

describe("creating and joining", () => {
  it("needs Pro to create, but anyone can join", async () => {
    const free = await user("free");
    expect(await createFamily(free.client, "Mine")).toEqual({ ok: false, message: "Creating a family is part of Drip Pro." });
    const { owner, member, fam } = await family();
    expect(fam).toMatchObject({ name: "The Smiths", ownerId: owner.id });
    expect(fam.inviteCode).toMatch(/^[0-9A-F]{10}$/);
    const seen = (await loadFamily(member.client))!;
    expect(seen.members.map((m) => m.email).sort()).toEqual([owner.email, member.email].sort());
  });

  it("explains bad codes, second families and full families", async () => {
    const { owner, member, fam } = await family();
    const stranger = await user("stranger");
    expect(await joinFamily(stranger.client, "NOPE000000")).toMatchObject({ ok: false, message: "No family has that code. Check it and try again." });
    expect(await joinFamily(member.client, fam.inviteCode)).toMatchObject({ ok: false, message: expect.stringContaining("already in a family") });
    expect(await createFamily(owner.client, "Another")).toMatchObject({ ok: false, message: expect.stringContaining("already in a family") });
    for (let i = 0; i < 4; i++) {
      const extra = await user(`extra${i}`);
      expect((await joinFamily(extra.client, fam.inviteCode)).ok).toBe(true);
    }
    expect(await joinFamily(stranger.client, fam.inviteCode)).toMatchObject({ ok: false, message: "That family is full (6 people)." });
  });

  it("outsiders see nothing", async () => {
    await family();
    const outsider = await user("outsider");
    expect(await loadFamily(outsider.client)).toBeNull();
    expect((await outsider.client.from("households").select("id")).data).toEqual([]);
  });
});

describe("sharing", () => {
  it("family members can read shared subscriptions but only the owner can change them", async () => {
    const { owner, member, fam } = await family();
    const netflix = { ...sub("Netflix", 18), shared: true };
    const privateOne = sub("Private");
    expect((await owner.client.from("subscriptions").insert([toRow(netflix, owner.id, fam.id), toRow(privateOne, owner.id, fam.id)])).error).toBeNull();

    const seen = (await loadFamily(member.client))!;
    expect(seen.shared.map((s) => [s.name, s.ownerId, s.shared])).toEqual([["Netflix", owner.id, true]]);

    await member.client.from("subscriptions").update({ price: 1 }).eq("id", netflix.id);
    await member.client.from("subscriptions").delete().eq("id", netflix.id);
    const { data } = await owner.client.from("subscriptions").select("price").eq("id", netflix.id).single();
    expect(data?.price).toBe(18);

    // The member's own list (pullAccount) doesn't include other people's subscriptions.
    const pulled = await pullAccount(member.client, member.id);
    expect(pulled.ok && pulled.data.subs).toEqual([]);
  });

  it("you can't share into a family you're not in", async () => {
    const { fam } = await family();
    const outsider = await user("sneaky");
    const { error } = await outsider.client.from("subscriptions").insert(toRow({ ...sub("Sneaky"), shared: true }, outsider.id, fam.id));
    expect(error?.code).toBe("42501");
  });
});

describe("leaving", () => {
  it("a member leaving stops sharing their subscriptions", async () => {
    const { owner, member, fam } = await family();
    const spotify = { ...sub("Spotify"), shared: true };
    await member.client.from("subscriptions").insert(toRow(spotify, member.id, fam.id));
    expect(await leaveFamily(member.client)).toEqual({ ok: true, value: undefined });
    expect(await loadFamily(member.client)).toBeNull();
    const ownerView = (await loadFamily(owner.client))!;
    expect(ownerView.members.map((m) => m.userId)).toEqual([owner.id]);
    expect(ownerView.shared).toEqual([]);
    const { data } = await member.client.from("subscriptions").select("household_id").eq("id", spotify.id).single();
    expect(data?.household_id).toBeNull();
  });

  it("the owner leaving ends the family for everyone", async () => {
    const { owner, member, fam } = await family();
    await member.client.from("subscriptions").insert(toRow({ ...sub("Max"), shared: true }, member.id, fam.id));
    await leaveFamily(owner.client);
    expect(await loadFamily(member.client)).toBeNull();
    expect((await adminClient().from("households").select("id").eq("id", fam.id)).data).toEqual([]);
    const { data } = await member.client.from("subscriptions").select("household_id").eq("user_id", member.id);
    expect(data).toEqual([{ household_id: null }]);
  });

  it("only the owner removes people or renews the code", async () => {
    const { owner, member, fam } = await family();
    expect((await removeMember(member.client, owner.id)).ok).toBe(false);
    expect((await renewInviteCode(member.client)).ok).toBe(false);
    const renewed = await renewInviteCode(owner.client);
    expect(renewed.ok && renewed.value).toMatch(/^[0-9A-F]{10}$/);
    const late = await user("late");
    expect((await joinFamily(late.client, fam.inviteCode)).ok).toBe(false);
    expect(await removeMember(owner.client, member.id)).toEqual({ ok: true, value: undefined });
    expect((await loadFamily(owner.client))!.members).toHaveLength(1);
  });
});
