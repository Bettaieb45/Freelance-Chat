import { describe, expect, it } from "vitest";
import { findReplyToken, replyAddress } from "./config";
import { stripQuoted } from "./quote";

describe("stripQuoted", () => {
  it("removes Gmail-style quoted history", () => {
    const text = `Sounds good, Friday works!

On Mon, Oct 6, 2026 at 10:00 AM Oussama B <me@gmail.com> wrote:
> Can we meet Friday?
> Thanks`;
    expect(stripQuoted(text)).toBe("Sounds good, Friday works!");
  });

  it("handles the wrapped two-line Gmail header", () => {
    const text = `Yes please

On Mon, Oct 6, 2026 at 10:00 AM Oussama B <
me+cabc@gmail.com> wrote:
> earlier`;
    expect(stripQuoted(text)).toBe("Yes please");
  });

  it("removes French Gmail/Apple quotes", () => {
    const text = `Parfait, merci.

Le lun. 6 oct. 2026 à 10:00, Oussama B <me@gmail.com> a écrit :
> Bonjour`;
    expect(stripQuoted(text)).toBe("Parfait, merci.");
  });

  it("removes Outlook original-message blocks and mobile signatures", () => {
    expect(stripQuoted("Done.\n\nSent from my iPhone")).toBe("Done.");
    expect(stripQuoted("Ok\n\n-----Original Message-----\nFrom: x\nhello")).toBe("Ok");
    expect(stripQuoted("Ok\n\nFrom: Oussama B <me@gmail.com>\nSent: Monday\nhello")).toBe("Ok");
  });

  it("keeps multi-paragraph replies intact", () => {
    expect(stripQuoted("First line\n\nSecond paragraph")).toBe("First line\n\nSecond paragraph");
  });
});

describe("reply addresses", () => {
  const token = "0123456789abcdef01234567";
  it("builds plus addresses and finds the token again", () => {
    const addr = replyAddress(token, "me.name@gmail.com");
    expect(addr).toBe(`me.name+c${token}@gmail.com`);
    expect(findReplyToken([null, "someone@x.com", `Me <${addr.toUpperCase()}>`])).toBe(token);
  });
  it("ignores addresses without a token", () => {
    expect(findReplyToken(["me@gmail.com", "me+other@gmail.com", undefined])).toBeNull();
  });
});
