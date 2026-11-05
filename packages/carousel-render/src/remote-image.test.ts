import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

/** What each outgoing request gets back, keyed by URL. Nothing here touches the network. */
const responses = new Map<string, { status: number; location?: string; body?: Buffer }>();
const requested: string[] = [];
const dnsAnswers = new Map<string, string[]>();

vi.mock("node:https", () => ({
  request: (url: URL, _options: unknown, onResponse: (res: unknown) => void) => {
    const req = Object.assign(new EventEmitter(), {
      destroy: (err: Error) => req.emit("error", err),
      end: () => {
        requested.push(url.href);
        const r = responses.get(url.href);
        if (!r) return void req.emit("error", new Error(`no response for ${url.href}`));
        const res = Object.assign(new PassThrough(), {
          statusCode: r.status,
          headers: r.location ? { location: r.location } : {},
        });
        onResponse(res);
        res.end(r.body);
      },
    });
    return req;
  },
}));

vi.mock("node:dns", () => ({
  lookup: (host: string, _options: unknown, cb: (err: Error | null, addresses: unknown[]) => void) => {
    const answers = dnsAnswers.get(host);
    if (!answers) return cb(new Error("ENOTFOUND"), []);
    cb(null, answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  },
}));

import { fetchAsDataUri, isPublicAddress, publicOnlyLookup } from "./remote-image.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const OK = "https://cdn.example/a.png";

beforeEach(() => {
  responses.clear();
  requested.length = 0;
  dnsAnswers.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "127.8.8.8", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.100.100.200", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:8.8.8.8", "::127.0.0.1", "64:ff9b::a9fe:a9fe",
    "fd00:ec2::254", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2002:7f00:1::", "2001:0:4136::1",
    "not-an-ip", "",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "76.76.21.21", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001::65"])(
    "allows %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe("publicOnlyLookup", () => {
  const resolve = (host: string, all: boolean) =>
    new Promise<unknown>((done, fail) => {
      publicOnlyLookup(host, { all }, (err, address) => (err ? fail(err) : done(address)));
    });

  it("refuses a name that resolves to an internal address", async () => {
    dnsAnswers.set("rebind.example", ["169.254.169.254"]);
    await expect(resolve("rebind.example", true)).rejects.toThrow(/public address/);
  });

  it("refuses when any one answer is internal, not just the first", async () => {
    dnsAnswers.set("mixed.example", ["8.8.8.8", "10.0.0.1"]);
    await expect(resolve("mixed.example", true)).rejects.toThrow(/public address/);
  });

  it("answers in the shape the caller asked for", async () => {
    dnsAnswers.set("cdn.example", ["8.8.8.8"]);
    await expect(resolve("cdn.example", true)).resolves.toEqual([{ address: "8.8.8.8", family: 4 }]);
    await expect(resolve("cdn.example", false)).resolves.toBe("8.8.8.8");
  });
});

describe("fetchAsDataUri", () => {
  it.each([
    "http://cdn.example/a.png",
    "https://cdn.example:8443/a.png",
    "https://user:pass@cdn.example/a.png",
    "https://cdn.example@127.0.0.1/a.png",
    "ftp://cdn.example/a.png",
    "file:///etc/passwd",
    "/carousels/a/slide-01.png",
    "not a url",
    "https://127.0.0.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://2130706433/",
    "https://0x7f.1/",
    "https://[::1]/",
    "https://[::ffff:a9fe:a9fe]/",
    "https://[fd00:ec2::254]/",
    "data:text/html,<h1>x</h1>",
  ])("refuses %s without sending a request", async (url) => {
    await expect(fetchAsDataUri(url)).resolves.toBeUndefined();
    expect(requested).toEqual([]);
  });

  it("passes an inline image straight through", async () => {
    await expect(fetchAsDataUri("data:image/png;base64,AAAA")).resolves.toBe("data:image/png;base64,AAAA");
    expect(requested).toEqual([]);
  });

  it("fetches a public image, labelled by its bytes and not the server's claim", async () => {
    responses.set(OK, { status: 200, body: JPEG });
    await expect(fetchAsDataUri(OK)).resolves.toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
  });

  it("follows a redirect to another public image, the way the logo service works", async () => {
    responses.set(OK, { status: 302, location: "https://t1.cdn.example/b.png" });
    responses.set("https://t1.cdn.example/b.png", { status: 200, body: PNG });
    await expect(fetchAsDataUri(OK)).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/",
    "https://user:pass@cdn.example/a.png",
    "http://cdn.example/a.png",
  ])("refuses a redirect to %s", async (location) => {
    responses.set(OK, { status: 302, location });
    await expect(fetchAsDataUri(OK)).resolves.toBeUndefined();
    expect(requested).toEqual([OK]);
  });

  it("gives up on a redirect loop", async () => {
    responses.set(OK, { status: 302, location: OK });
    await expect(fetchAsDataUri(OK)).resolves.toBeUndefined();
    expect(requested.length).toBeLessThanOrEqual(4);
  });

  it.each([
    ["an error status", { status: 500, body: PNG }],
    ["html", { status: 200, body: Buffer.from("<html>secret</html>") }],
    ["an svg", { status: 200, body: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") }],
    ["nothing", { status: 200, body: Buffer.alloc(0) }],
  ])("skips %s", async (_label, response) => {
    responses.set(OK, response);
    await expect(fetchAsDataUri(OK)).resolves.toBeUndefined();
  });
});
