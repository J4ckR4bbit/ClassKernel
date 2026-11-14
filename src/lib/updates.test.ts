import { describe, expect, it } from "vitest";
import { downloadShare, explainUpdateError } from "./updates";

describe("updates", () => {
  it("works out the share downloaded, when the size is known", () => {
    expect(downloadShare(0, 100)).toBe(0);
    expect(downloadShare(25, 100)).toBe(0.25);
    expect(downloadShare(150, 100)).toBe(1);
    expect(downloadShare(10, undefined)).toBeNull();
    expect(downloadShare(10, 0)).toBeNull();
  });

  it("explains a failure in plain words", () => {
    expect(explainUpdateError(new Error("Could not fetch a valid release JSON from the remote"))).toBe("No update has been published yet.");
    expect(explainUpdateError("error sending request for url (https://github.com/…)")).toContain("internet connection");
    expect(explainUpdateError(new Error("signature verification failed"))).toContain("safety check");
    expect(explainUpdateError(new Error("disk full"))).toBe("Couldn't update: disk full");
  });
});
