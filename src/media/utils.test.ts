import { decodeUTF8 } from "./utils";

describe("decodeUTF8", () => {
  test("should decode Instagram Unicode escape sequences", () => {
    const input =
      "Basil, Eucalyptus, Thyme \u00f0\u009f\u0098\u008d\u00f0\u009f\u008c\u00b1";
    const result = decodeUTF8(input);
    expect(result).toBe("Basil, Eucalyptus, Thyme 😍🌱");
  });
});
