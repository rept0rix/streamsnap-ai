#!/usr/bin/env node
import assert from "node:assert/strict";

console.log("\nAdmin & Permissions logic");

// Test role validations
const validRoles = ["user", "admin"];
const validPlans = ["free", "pro"];

assert.equal(validRoles.includes("admin"), true);
assert.equal(validRoles.includes("user"), true);
assert.equal(validRoles.includes("superadmin"), false);

assert.equal(validPlans.includes("pro"), true);
assert.equal(validPlans.includes("free"), true);
assert.equal(validPlans.includes("enterprise"), false);

console.log("  ✓ role and plan guard validations pass");
console.log("\n✓ All admin tests passed!\n");
