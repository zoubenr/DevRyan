import OpenAiToolSchemaSanitizerPlugin from "./openai-tool-schema-sanitizer.mjs";

const { describe, expect, test } = process.env.VITEST
  ? await import("vitest")
  : await import("bun:test");

const sanitize = async (parameters) => {
  const hooks = await OpenAiToolSchemaSanitizerPlugin();
  const output = { description: "tool", parameters };
  await hooks["tool.definition"]({ toolID: "t" }, output);
  return output.parameters;
};

describe("openai tool schema sanitizer", () => {
  test("strips a top-level email pattern that uses lookahead", async () => {
    const out = await sanitize({
      type: "object",
      properties: { email: { type: "string", pattern: "^(?=.{1,254}$).+@.+$" } },
    });
    expect(out.properties.email.pattern).toBeUndefined();
    expect(out.properties.email.type).toBe("string"); // field preserved
  });

  test("keeps patterns that do NOT use lookaround", async () => {
    const out = await sanitize({
      type: "object",
      properties: { code: { type: "string", pattern: "^[A-Z]{3}$" } },
    });
    expect(out.properties.code.pattern).toBe("^[A-Z]{3}$");
  });

  test("strips nested lookaround patterns (items / anyOf / $defs)", async () => {
    const out = await sanitize({
      type: "object",
      properties: {
        list: { type: "array", items: { type: "string", pattern: "(?!x)y" } },
        nested: { anyOf: [{ type: "string", pattern: "(?<=a)b" }, { type: "number" }] },
      },
      $defs: { e: { type: "string", pattern: "a(?=b)" } },
    });
    expect(out.properties.list.items.pattern).toBeUndefined();
    expect(out.properties.nested.anyOf[0].pattern).toBeUndefined();
    expect(out.properties.nested.anyOf[1].type).toBe("number");
    expect(out.$defs.e.pattern).toBeUndefined();
  });

  test("strips negative lookbehind and tolerates non-object inputs", async () => {
    expect((await sanitize({ type: "string", pattern: "(?<!z)w" })).pattern).toBeUndefined();
    expect(await sanitize(null)).toBeNull();
    expect(await sanitize({})).toEqual({});
  });
});
