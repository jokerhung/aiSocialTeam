// node --test scripts/i18n.test.mjs   (Node 22.18+ runs the .ts files directly)
import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocale, localeFromAcceptLanguage, LOCALES } from "../web/lib/i18n/config.ts";
import { makePlural, makeTranslate, normalize } from "../web/lib/i18n/translate.ts";

const dictionary = { "Create post": "Tạo bài đăng", "Hello {name}": "Xin chào {name}", "{n} posts": "{n} bài đăng", "{n} tags": "{n} thẻ" };

test("a text with no translation comes back in English", () => {
  const t = makeTranslate("vi", dictionary);
  assert.equal(t("Create post"), "Tạo bài đăng");
  assert.equal(t("Something new"), "Something new");
});

test("{name} is filled from params, in both languages", () => {
  assert.equal(makeTranslate("vi", dictionary)("Hello {name}", { name: "An" }), "Xin chào An");
  assert.equal(makeTranslate("en", {})("Hello {name}", { name: "An" }), "Hello An");
  // a placeholder with no value stays visible instead of vanishing
  assert.equal(makeTranslate("en", {})("Hello {name}"), "Hello {name}");
  assert.equal(makeTranslate("en", {})("Hello {name}", {}), "Hello {name}");
});

test("line breaks and indentation in JSX text do not change the key", () => {
  const t = makeTranslate("vi", dictionary);
  assert.equal(normalize("  Create\n      post "), "Create post");
  assert.equal(t("Create\n   post"), "Tạo bài đăng");
});

test("English picks the singular for 1, Vietnamese has one form", () => {
  const en = makePlural("en", {});
  assert.equal(en(1, "{n} post", "{n} posts"), "1 post");
  assert.equal(en(0, "{n} post", "{n} posts"), "0 posts");
  assert.equal(en(5, "{n} post", "{n} posts"), "5 posts");
  const vi = makePlural("vi", dictionary);
  assert.equal(vi(1, "{n} post", "{n} posts"), "1 bài đăng");
  assert.equal(vi(7, "{n} post", "{n} posts"), "7 bài đăng");
});

test("the language is taken from the browser's Accept-Language", () => {
  assert.equal(localeFromAcceptLanguage("vi-VN,vi;q=0.9,en;q=0.8"), "vi");
  assert.equal(localeFromAcceptLanguage("vi"), "vi");
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,vi;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("fr-FR"), "en");
  assert.equal(localeFromAcceptLanguage(null), "en");
  assert.equal(localeFromAcceptLanguage(""), "en");
});

test("only the known languages are accepted", () => {
  assert.deepEqual([...LOCALES], ["en", "vi"]);
  assert.equal(isLocale("vi"), true);
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale(undefined), false);
});
