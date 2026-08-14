import assert from "node:assert/strict";
import test from "node:test";
import { readConfig, type WebIQResponse } from "../src/webiq-client.ts";
import { createSearchHandler, searchInputSchema, TOOL_NAME } from "../src/server.ts";

const config = readConfig({ CLAUDE_WEBIQ_ENDPOINT: "http://127.0.0.1:8313" });

test("uses a collision-resistant MCP tool name", () => {
	assert.equal(TOOL_NAME, "webiq_search");
});

test("search schema accepts only a focused query and bounded result count", () => {
	assert.equal(searchInputSchema.safeParse({ query: "latest node release" }).success, true);
	assert.equal(searchInputSchema.safeParse({ query: "q", max_results: 10 }).success, true);
	assert.equal(searchInputSchema.safeParse({ query: "" }).success, false);
	assert.equal(searchInputSchema.safeParse({ query: "x".repeat(401) }).success, false);
	assert.equal(searchInputSchema.safeParse({ query: "q", max_results: 11 }).success, false);
	assert.equal(searchInputSchema.safeParse({ query: "q", extra: true }).success, false);
});

test("handler returns formatted text and forwards max_results", async () => {
	let seenMaxResults: number | undefined;
	const response: WebIQResponse = {
		query: "latest node release",
		elapsedMs: 10,
		results: [{ title: "Node.js", url: "https://nodejs.org", content: "v24" }],
	};
	const handler = createSearchHandler(config, async (_query, _config, options) => {
		seenMaxResults = options?.maxResults;
		return response;
	});

	const result = await handler({ query: response.query, max_results: 3 });
	assert.equal(seenMaxResults, 3);
	assert.equal(result.isError, undefined);
	assert.match(result.content[0].text, /\[1\] Node\.js/);
	assert.match(result.content[0].text, /https:\/\/nodejs\.org/);
	assert.match(result.content[0].text, /Untrusted web content/);
});

test("handler converts upstream failures into MCP tool errors", async () => {
	const handler = createSearchHandler(config, async () => {
		throw new Error("proxy unavailable");
	});
	const result = await handler({ query: "q" });
	assert.equal(result.isError, true);
	assert.equal(result.content[0].text, "proxy unavailable");
});
