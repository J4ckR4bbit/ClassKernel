import { describe, expect, it } from "vitest";
import { TopicEntry } from "./types";
import { TopicBank, deleteGrade, parseTopicPaste, shareTopics, subtopicsForGrade, topicGrade, topicGroup, unshareTopics } from "./topics";

const row = (grade: string, subtopic: string, area = "Physics"): TopicEntry => ({ grade, area, subtopic, short: "" });

// Grade 10 owns a list that 11 and 12 share; 9 keeps a list of its own.
const bank = (): TopicBank => ({
  topics: [row("10", "Kinematics"), row("10", "Forces"), row("9", "Energy")],
  links: { "11": "10", "12": "10" },
});

describe("grades sharing a topic list", () => {
  it("finds the grade whose list a grade uses", () => {
    const { links } = bank();
    expect(topicGrade(links, "12")).toBe("10");
    expect(topicGrade(links, "10")).toBe("10");
    expect(topicGrade(links, "9")).toBe("9");
    // A hand-edited chain is followed; a loop doesn't hang.
    expect(topicGrade({ "12": "11", "11": "10" }, "12")).toBe("10");
    expect(["10", "11"]).toContain(topicGrade({ "10": "11", "11": "10" }, "10"));
  });

  it("lists every grade on the same list, in grade order", () => {
    const { links } = bank();
    expect(topicGroup(links, "12")).toEqual(["10", "11", "12"]);
    expect(topicGroup(links, "10")).toEqual(["10", "11", "12"]);
    expect(topicGroup(links, "9")).toEqual(["9"]);
    expect(topicGroup({ "10": "8" }, "8")).toEqual(["8", "10"]);
  });

  it("shares a list: the grade's own list goes, and grades sharing it follow", () => {
    const next = shareTopics(bank(), "10", "9");
    expect(next.links).toEqual({ "10": "9", "11": "9", "12": "9" });
    expect(next.topics).toEqual([row("9", "Energy")]);
    expect(subtopicsForGrade(next.topics, topicGrade(next.links, "12")).map((s) => s.subtopic)).toEqual(["Energy"]);
  });

  it("shares with the owner when given a grade that itself shares", () => {
    const next = shareTopics(bank(), "9", "11");
    expect(next.links["9"]).toBe("10");
    expect(next.topics.some((t) => t.grade === "9")).toBe(false);
  });

  it("changes nothing when the grades already share, or a grade is asked to share with itself", () => {
    const b = bank();
    expect(shareTopics(b, "11", "12")).toEqual(b);
    expect(shareTopics(b, "10", "10")).toEqual(b);
  });

  it("stops sharing by giving the grade its own copy", () => {
    const next = unshareTopics(bank(), "11");
    expect(next.links).toEqual({ "12": "10" });
    expect(subtopicsForGrade(next.topics, "11").map((s) => s.subtopic)).toEqual(["Kinematics", "Forces"]);
    expect(subtopicsForGrade(next.topics, "10").map((s) => s.subtopic)).toEqual(["Kinematics", "Forces"]);
    // A grade with its own list is left as it is.
    expect(unshareTopics(bank(), "10")).toEqual(bank());
  });

  it("deletes a grade with its own list", () => {
    const next = deleteGrade(bank(), "9");
    expect(next.topics.some((t) => t.grade === "9")).toBe(false);
    expect(next.links).toEqual(bank().links);
  });

  it("deletes a grade that only shares, leaving the list with its owner", () => {
    const next = deleteGrade(bank(), "11");
    expect(next.links).toEqual({ "12": "10" });
    expect(next.topics).toEqual(bank().topics);
  });

  it("hands a deleted grade's list to the first grade sharing it", () => {
    const next = deleteGrade(bank(), "10");
    expect(next.links).toEqual({ "12": "11" });
    expect(subtopicsForGrade(next.topics, "11").map((s) => s.subtopic)).toEqual(["Kinematics", "Forces"]);
    expect(next.topics.some((t) => t.grade === "10")).toBe(false);
    expect(topicGrade(next.links, "12")).toBe("11");
  });

  it("keeps a hand-edited chain pointing at a list when a grade in the middle is deleted", () => {
    const next = deleteGrade({ topics: [row("10", "Forces")], links: { "12": "11", "11": "10" } }, "11");
    expect(next.links).toEqual({ "12": "10" });
  });
});

describe("parseTopicPaste", () => {
  it("reads one subtopic per line, with an optional short label after a tab, skipping blank lines", () => {
    expect(parseTopicPaste("Newton's laws\tN1\r\n\n  Momentum  \nImpulse\t Imp ")).toEqual([
      { subtopic: "Newton's laws", short: "N1" },
      { subtopic: "Momentum", short: "" },
      { subtopic: "Impulse", short: "Imp" },
    ]);
  });
});
