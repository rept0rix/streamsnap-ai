#!/usr/bin/env node
/**
 * Schema tests.
 *
 * These check that the database refuses bad data on its own, without relying on
 * application code to be careful. The catalog constraint matters most: an
 * unverified row there becomes a broken link wearing a "verified" badge, which
 * is exactly the failure this project has already hit once.
 *
 * Requires python3 with sqlite3 (standard library).
 * Usage: node worker/test/schema.test.mjs
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, "..", "migrations", "0001_initial.sql");

let passed = 0;
let failed = 0;

/**
 * Run statements against a fresh in-memory DB.
 * Returns { ok, error } — `ok: false` means SQLite rejected the input.
 */
function run(statements) {
  const script = `
import sqlite3, json, sys
con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys = ON')
con.executescript(open(${JSON.stringify(MIGRATION)}).read())
try:
    for s in json.loads(sys.argv[1]):
        con.execute(s)
    con.commit()
    print(json.dumps({"ok": True}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;
  const out = execFileSync("python3", ["-c", script, JSON.stringify(statements)], {
    encoding: "utf8"
  });
  return JSON.parse(out.trim());
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assertAccepted(statements, what) {
  const r = run(statements);
  if (!r.ok) throw new Error(`${what} should have been accepted: ${r.error}`);
}

function assertRejected(statements, what) {
  const r = run(statements);
  if (r.ok) throw new Error(`${what} should have been rejected but was stored`);
}

const USER = `INSERT INTO users (id, email, google_sub) VALUES ('usr_1', 'a@b.com', 'sub1')`;

console.log("\nUsers");

test("accepts a valid user", () => {
  assertAccepted([USER], "a plain user");
});

test("rejects a duplicate email", () => {
  assertRejected(
    [USER, `INSERT INTO users (id, email, google_sub) VALUES ('usr_2', 'a@b.com', 'sub2')`],
    "a second account on the same email"
  );
});

test("rejects an unknown role", () => {
  assertRejected(
    [`INSERT INTO users (id, email, role) VALUES ('usr_3', 'c@d.com', 'superadmin')`],
    "role 'superadmin'"
  );
});

test("rejects an unknown plan", () => {
  assertRejected(
    [`INSERT INTO users (id, email, plan) VALUES ('usr_4', 'e@f.com', 'enterprise')`],
    "plan 'enterprise'"
  );
});

test("defaults new users to the least privilege", () => {
  const script = `
import sqlite3, json
con = sqlite3.connect(':memory:')
con.executescript(open(${JSON.stringify(MIGRATION)}).read())
con.execute("INSERT INTO users (id, email) VALUES ('usr_5', 'g@h.com')")
row = con.execute("SELECT role, plan, quota_override FROM users WHERE id='usr_5'").fetchone()
print(json.dumps(row))
`;
  const [role, plan, override] = JSON.parse(
    execFileSync("python3", ["-c", script], { encoding: "utf8" }).trim()
  );
  if (role !== "user") throw new Error(`default role was '${role}', expected 'user'`);
  if (plan !== "free") throw new Error(`default plan was '${plan}', expected 'free'`);
  if (override !== null) throw new Error("new users must not carry a quota override");
});

console.log("\nCatalog — the verified-ASIN guarantee");

test("accepts a well-formed ASIN", () => {
  assertAccepted(
    [
      USER,
      `INSERT INTO catalog_products (asin, title, category, verified_by)
       VALUES ('B0002E4Z8M', 'Shure SM7B', 'Audio & Mic', 'usr_1')`
    ],
    "a real ASIN"
  );
});

test("rejects an ASIN of the wrong length", () => {
  assertRejected(
    [`INSERT INTO catalog_products (asin, title, category) VALUES ('B0002', 'Too short', 'x')`],
    "a five-character ASIN"
  );
});

test("rejects an identifier that is not an ASIN at all", () => {
  assertRejected(
    [`INSERT INTO catalog_products (asin, title, category) VALUES ('1234567890', 'Not an ASIN', 'x')`],
    "a ten-digit number"
  );
});

test("rejects an unknown verification method", () => {
  assertRejected(
    [
      `INSERT INTO catalog_products (asin, title, category, verify_method)
       VALUES ('B0002E4Z8M', 'Shure SM7B', 'Audio', 'i_assumed_it_was_right')`
    ],
    "an invented verify_method"
  );
});

test("rejects a catalog entry attributed to a non-existent user", () => {
  assertRejected(
    [
      `INSERT INTO catalog_products (asin, title, category, verified_by)
       VALUES ('B0002E4Z8M', 'Shure SM7B', 'Audio', 'usr_ghost')`
    ],
    "verification by an unknown account"
  );
});

console.log("\nSaved products");

test("collapses a re-sighting instead of duplicating", () => {
  assertRejected(
    [
      USER,
      `INSERT INTO saved_products (id, user_id, asin, title) VALUES ('p1', 'usr_1', 'B0002E4Z8M', 'Mic')`,
      `INSERT INTO saved_products (id, user_id, asin, title) VALUES ('p2', 'usr_1', 'B0002E4Z8M', 'Mic again')`
    ],
    "the same ASIN saved twice for one user"
  );
});

test("lets two users each save the same product", () => {
  assertAccepted(
    [
      USER,
      `INSERT INTO users (id, email, google_sub) VALUES ('usr_2', 'x@y.com', 'sub2')`,
      `INSERT INTO saved_products (id, user_id, asin, title) VALUES ('p1', 'usr_1', 'B0002E4Z8M', 'Mic')`,
      `INSERT INTO saved_products (id, user_id, asin, title) VALUES ('p2', 'usr_2', 'B0002E4Z8M', 'Mic')`
    ],
    "the same ASIN for two different accounts"
  );
});

test("deletes a user's data with the user", () => {
  const script = `
import sqlite3, json
con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys = ON')
con.executescript(open(${JSON.stringify(MIGRATION)}).read())
con.execute("INSERT INTO users (id, email) VALUES ('usr_1', 'a@b.com')")
con.execute("INSERT INTO saved_products (id, user_id, title) VALUES ('p1', 'usr_1', 'Mic')")
con.execute("INSERT INTO user_settings (user_id) VALUES ('usr_1')")
con.execute("DELETE FROM users WHERE id='usr_1'")
print(json.dumps([
    con.execute("SELECT COUNT(*) FROM saved_products").fetchone()[0],
    con.execute("SELECT COUNT(*) FROM user_settings").fetchone()[0],
]))
`;
  const [saved, settings] = JSON.parse(
    execFileSync("python3", ["-c", script], { encoding: "utf8" }).trim()
  );
  if (saved !== 0 || settings !== 0) {
    throw new Error(`cascade left ${saved} products and ${settings} settings rows behind`);
  }
});

console.log("\nUsage");

test("keeps anonymous events without a user row", () => {
  assertAccepted(
    [
      `INSERT INTO usage_events (anon_id, kind, result_count) VALUES ('anon_abc', 'resolve', 3)`
    ],
    "a pre-signup scan"
  );
});

test("rejects an unknown event kind", () => {
  assertRejected(
    [`INSERT INTO usage_events (kind) VALUES ('something_else')`],
    "an undeclared event kind"
  );
});

console.log(`\n${failed ? "✗" : "✓"} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
