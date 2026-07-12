import test from "node:test";
import assert from "node:assert/strict";
import { parseBooleanEnv, resolveAllowRegister, isRegistrationClosed } from "../lib/register-policy.ts";

test("parseBooleanEnv parses truthy values", () => {
  assert.equal(parseBooleanEnv("true", false), true);
  assert.equal(parseBooleanEnv("1", false), true);
  assert.equal(parseBooleanEnv(" YES ", false), true);
});

test("parseBooleanEnv parses falsy values", () => {
  assert.equal(parseBooleanEnv("false", true), false);
  assert.equal(parseBooleanEnv("0", true), false);
  assert.equal(parseBooleanEnv(" Off ", true), false);
});

test("parseBooleanEnv falls back for empty or unknown values", () => {
  assert.equal(parseBooleanEnv(undefined, true), true);
  assert.equal(parseBooleanEnv("", false), false);
  assert.equal(parseBooleanEnv("random", true), true);
});

test("resolveAllowRegister respects boolean value and fallback", () => {
  assert.equal(resolveAllowRegister(true, false), true);
  assert.equal(resolveAllowRegister(false, true), false);
  assert.equal(resolveAllowRegister(undefined, true), true);
  assert.equal(resolveAllowRegister("true", false), false);
});

test("isRegistrationClosed follows allowRegister switch", () => {
  assert.equal(isRegistrationClosed(true), false);
  assert.equal(isRegistrationClosed(false), true);
});
