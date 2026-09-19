import assert from "node:assert/strict";
import { test } from "node:test";
import { isLikelyNonEnglish, detectAdLanguage } from "../src/lib/language-detect";

test("isLikelyNonEnglish flags a real non-Latin-script ad (Thai)", () => {
  assert.equal(
    isLikelyNonEnglish("ดีลสุดคุ้ม! เคสไอแพดลิลลี่ แพด แถมฟรีสายชาร์จ! โค้ทลดเพิ่ม 100 บาท จำนวนจำกัด"),
    true
  );
});

test("isLikelyNonEnglish flags long, clearly non-English Latin-script text", () => {
  assert.equal(
    isLikelyNonEnglish(
      "Comprar ahora con envio gratis a toda Espana, la mejor proteccion para tu telefono con envio en 24 horas garantizado."
    ),
    true
  );
  assert.equal(
    isLikelyNonEnglish(
      "Schuetzen Sie Ihre Augen vor schaedlichem blauem Licht mit unserem hochwertigen Bildschirmschutz fuer alle Geraete."
    ),
    true
  );
});

test("isLikelyNonEnglish does not flag long English ad copy", () => {
  assert.equal(
    isLikelyNonEnglish(
      "Protect your eyes from harmful blue light with our premium screen protector, trusted by thousands of happy customers worldwide."
    ),
    false
  );
});

test("isLikelyNonEnglish does not flag short English ad copy, even URL/emoji-heavy (a real synced ad)", () => {
  // franc alone misclassifies this as Dutch/Scots at low thresholds — the
  // whole reason for the 60-char floor. Regression guard for that.
  assert.equal(isLikelyNonEnglish("Shop here barnerbrand.com"), false);
  assert.equal(isLikelyNonEnglish("Shop here ➡️ barnerbrand.com"), false);
});

test("isLikelyNonEnglish defaults to false (not filtered) for null, empty, or missing text", () => {
  assert.equal(isLikelyNonEnglish(null), false);
  assert.equal(isLikelyNonEnglish(undefined), false);
  assert.equal(isLikelyNonEnglish(""), false);
  assert.equal(isLikelyNonEnglish("   "), false);
});

test("detectAdLanguage returns the actual ISO 639-3 code for confidently non-English text", () => {
  assert.equal(
    detectAdLanguage("ดีลสุดคุ้ม! เคสไอแพดลิลลี่ แพด แถมฟรีสายชาร์จ! โค้ทลดเพิ่ม 100 บาท จำนวนจำกัด"),
    "tha"
  );
  assert.equal(
    detectAdLanguage(
      "Comprar ahora con envio gratis a toda Espana, la mejor proteccion para tu telefono con envio en 24 horas garantizado."
    ),
    "spa"
  );
});

test("detectAdLanguage returns null for English, short, or undetermined text", () => {
  assert.equal(
    detectAdLanguage(
      "Protect your eyes from harmful blue light with our premium screen protector, trusted by thousands of happy customers worldwide."
    ),
    null
  );
  assert.equal(detectAdLanguage("Shop here ➡️ barnerbrand.com"), null);
  assert.equal(detectAdLanguage(null), null);
  assert.equal(detectAdLanguage(""), null);
});
