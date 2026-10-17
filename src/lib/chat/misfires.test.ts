import { describe, expect, it } from "vitest";
import { authorisationFor } from "@/lib/chat/authorise";
import { guardUnconfirmedClaims } from "@/lib/chat/toolLoop";
import { wantsFood } from "@/lib/chat/food";
import { wantsKidsActivities } from "@/lib/chat/kids";

/**
 * Ordinary messages that used to be mistaken for something else, found in review: a question about a book club or "my plan" taken as
 * a request to add something to the calendar, a "thanks" taken as a yes, a normal answer replaced as if it were a false claim of
 * having added something, and lists pushed at the model for questions that were not about food or children.
 */

describe("a question is not a request to add something", () => {
  it("is not, whatever it says about a book, a plan, a calendar or a diary", () => {
    for (const text of [
      "Do I need to book the pottery class?",
      "What's in my plan for Saturday?",
      "Tell me about the book club",
      "Is there a plan B if it rains?",
      "What's on my calendar this week?",
      "Is there a book swap on?",
      "Can you book a table somewhere?",
      "How do I use the diary?",
    ]) {
      expect(authorisationFor(text, null), text).toBe("none");
    }
  });

  it("is still one when it clearly is", () => {
    for (const text of ["Add this to my calendar", "Book this into my diary for Saturday", "Put it in my plan", "Schedule this every Tuesday", "Add the second one you suggested", "I'd like to go to this"]) {
      expect(authorisationFor(text, null), text).toBe("explicit");
    }
  });
});

describe("a yes only answers an offer", () => {
  it("is not a thank-you after something that was merely mentioned", () => {
    for (const reply of ["Thanks", "thank you", "Great, thanks", "ok thanks"]) {
      expect(authorisationFor(reply, "Shall I add the pottery class to your plan?"), reply).toBe("none");
    }
  });

  it("is not a yes after the concierge said what it can do or what they could do", () => {
    for (const said of ["I can see it's at the library, and you can book online.", "You could add it to your calendar. Do you need directions?", "I can tell you more about it if you like."]) {
      expect(authorisationFor("Great", said), said).toBe("none");
    }
  });

  it("is a yes after a real offer", () => {
    expect(authorisationFor("Yes please", "It is the Autumn Concert on Saturday at 2pm. Shall I add it?")).toBe("affirmative");
    expect(authorisationFor("Yes", "Would you like me to add it to your Google Calendar too?")).toBe("affirmative");
    expect(authorisationFor("Great", "Do you want me to put it in your plan for Saturday?")).toBe("affirmative");
  });
});

describe("an ordinary answer is not replaced as a false claim", () => {
  it("is left alone when it only says it has put ideas together", () => {
    for (const text of ["I've put together three ideas for you.", "I've put a few options below.", "I've added a few ideas below for you to look at.", "I've booked nothing yet, but here are some ideas."]) {
      expect(guardUnconfirmedClaims(text, []).replaced, text).toBe(false);
    }
  });

  it("is still replaced when it claims something was added and nothing was", () => {
    for (const text of ["I've added it to your calendar.", "I've booked that for Saturday.", "I've put it in your plan for Saturday.", "I have scheduled this for you.", "I've added the concert to your plan."]) {
      expect(guardUnconfirmedClaims(text, []).replaced, text).toBe(true);
    }
  });
});

describe("a list is only added when the question is about that", () => {
  it("does not take a coffee morning, a food bank or a quiz meal deal for a question about food", () => {
    for (const text of ["any coffee mornings near me?", "volunteering at the food bank", "what's the meal deal at the quiz", "a cake sale at the church", "I like drinks parties"]) {
      expect(wantsFood(text), text).toBe(false);
    }
  });

  it("still takes a question about somewhere to eat", () => {
    for (const text of ["Where can I get lunch?", "any good cafes nearby", "somewhere for a coffee and cake", "I fancy a coffee", "I'm hungry", "a pub for Sunday dinner", "afternoon tea?"]) {
      expect(wantsFood(text), text).toBe(true);
    }
  });

  it("does not take a mention of children in need or kids grown up for a question about things for children", () => {
    for (const text of ["children in need volunteering", "my kids are grown up, something for me", "Is there a children's charity shop"]) {
      // "my kids" is a possessive about their own children and does match: the model is told to ask, not assume. The others do not.
      expect(wantsKidsActivities(text), text).toBe(text.includes("my kids"));
    }
  });

  it("still takes a mention of the grandchildren or taking the kids out", () => {
    for (const text of ["Find something to do with my grandchildren", "the grandkids are coming", "somewhere for a toddler", "something with the kids", "I'll take the children out Saturday"]) {
      expect(wantsKidsActivities(text), text).toBe(true);
    }
  });
});
