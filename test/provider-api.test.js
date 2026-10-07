const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROVIDERS,
  extractAssistantText,
  getApiEndpoint,
  getProviderConfig,
  getRequestForProvider,
  validateProviderConfig,
} = require("../app/provider-api");

test("provider presets provide safe defaults without storing API keys", () => {
  assert.equal(getProviderConfig("openrouter", {}).model, "openrouter/free");
  assert.equal(getProviderConfig("openai", {}).baseUrl, "https://api.openai.com/v1");
  assert.equal(getProviderConfig("anthropic", {}).model, "claude-sonnet-4-20250514");
  assert.equal(PROVIDERS.anthropic.protocol, "anthropic");
});

test("OpenAI-compatible endpoints append only the missing API path", () => {
  assert.equal(
    getApiEndpoint(PROVIDERS.openrouter, "https://openrouter.ai/api/v1"),
    "https://openrouter.ai/api/v1/chat/completions",
  );
  assert.equal(
    getApiEndpoint(PROVIDERS.custom, "https://gateway.example/v1/"),
    "https://gateway.example/v1/chat/completions",
  );
  assert.equal(
    getApiEndpoint(PROVIDERS.custom, "https://gateway.example/v1/chat/completions/"),
    "https://gateway.example/v1/chat/completions",
  );
  assert.equal(
    getApiEndpoint(PROVIDERS.anthropic, "https://api.anthropic.com"),
    "https://api.anthropic.com/v1/messages",
  );
});

test("custom endpoints require HTTPS except for local development services", () => {
  assert.equal(
    validateProviderConfig("custom", "test-model", "https://api.example/v1").baseUrl,
    "https://api.example/v1",
  );
  assert.equal(
    validateProviderConfig("custom", "local-model", "http://127.0.0.1:1234/v1").baseUrl,
    "http://127.0.0.1:1234/v1",
  );
  assert.throws(
    () => validateProviderConfig("custom", "test-model", "http://api.example/v1"),
    /Utilise une URL HTTPS/,
  );
  assert.throws(
    () => validateProviderConfig("custom", "test-model", "https://user:pass@api.example/v1"),
    /ne doit pas contenir de clé/,
  );
  assert.throws(
    () => validateProviderConfig("custom", "test-model", "https://api.example/v1?key=secret"),
    /ne doit pas contenir de clé/,
  );
});

test("Anthropic uses its native Messages API without an OpenAI bearer header", () => {
  const request = getRequestForProvider(
    "anthropic",
    { model: "claude-test", baseUrl: "https://api.anthropic.com" },
    "anthropic-secret",
    "Hello",
  );
  assert.equal(request.endpoint, "https://api.anthropic.com/v1/messages");
  assert.equal(request.headers["x-api-key"], "anthropic-secret");
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.body.model, "claude-test");
  assert.equal(request.body.messages[0].content, "Hello");
});

test("OpenAI-compatible requests include the selected model and bearer key", () => {
  const request = getRequestForProvider(
    "openai",
    { model: "gpt-test", baseUrl: "https://api.openai.com/v1" },
    "openai-secret",
    "Hello",
  );
  assert.equal(request.endpoint, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer openai-secret");
  assert.equal(request.body.model, "gpt-test");
});

test("assistant response parsing handles Anthropic and OpenAI text formats", () => {
  assert.equal(
    extractAssistantText(PROVIDERS.anthropic, {
      content: [{ type: "text", text: "Hello" }, { type: "tool_use", id: "x" }],
    }),
    "Hello",
  );
  assert.equal(
    extractAssistantText(PROVIDERS.openai, {
      choices: [{ message: { content: [{ type: "text", text: "One" }, { type: "text", text: "Two" }] } }],
    }),
    "One\nTwo",
  );
});
