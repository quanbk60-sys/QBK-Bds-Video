import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlusCode, decodeFull, recoverNearest } from "../worker/pluscode.mjs";

test("Plus Code: tách mã và địa danh", () => {
  assert.deepEqual(findPlusCode("XQVM+WCM Cái Răng, Cần Thơ"), { code: "XQVM+WCM", rest: "Cái Răng, Cần Thơ", full: false });
  assert.equal(findPlusCode("123 Nguyễn Huệ, Quận 1"), null);
});
test("Plus Code: giải mã đầy đủ và rút gọn", () => {
  const p = decodeFull("8FVC9G8F+6X");
  assert.ok(Math.abs(p.lat - 47.36556) < 1e-4 && Math.abs(p.lon - 8.52494) < 1e-4);
  const q = recoverNearest("XQVM+WCM", 10.03, 105.76); // Cái Răng, Cần Thơ
  assert.ok(Math.abs(q.lat - 9.99484) < 1e-4 && Math.abs(q.lon - 105.78355) < 1e-4);
});
