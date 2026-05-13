import { generateOpaqueToken, hashToken, isExpired } from "./token.util";

describe("token utilities", () => {
  it("generates high-entropy opaque tokens", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();

    expect(first).toHaveLength(64);
    expect(second).toHaveLength(64);
    expect(first).not.toBe(second);
  });

  it("hashes tokens deterministically without returning the raw token", () => {
    const token = "opaque-token";

    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it("detects expired dates", () => {
    const now = new Date("2026-05-10T12:00:00.000Z");

    expect(isExpired(new Date("2026-05-10T11:59:59.000Z"), now)).toBe(true);
    expect(isExpired(new Date("2026-05-10T12:00:01.000Z"), now)).toBe(false);
  });
});
