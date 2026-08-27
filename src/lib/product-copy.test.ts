import { describe, expect, it } from "vitest";
import { UPDATE_INSTALLATION_COPY } from "./product-copy";

describe("product contract copy", () => {
  it("describes updates as externally installed without promising an updater", () => {
    expect(UPDATE_INSTALLATION_COPY).toContain("外部");
    expect(UPDATE_INSTALLATION_COPY).not.toContain("检查更新");
    expect(UPDATE_INSTALLATION_COPY).not.toContain("更新源");
  });
});
