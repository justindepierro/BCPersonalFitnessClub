const browserGlobals = {
  alert: "readonly",
  Blob: "readonly",
  caches: "readonly",
  Chart: "readonly",
  clearTimeout: "readonly",
  confirm: "readonly",
  console: "readonly",
  CustomEvent: "readonly",
  document: "readonly",
  Event: "readonly",
  fetch: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  history: "readonly",
  localStorage: "readonly",
  location: "readonly",
  lucide: "readonly",
  MutationObserver: "readonly",
  navigator: "readonly",
  performance: "readonly",
  prompt: "readonly",
  requestAnimationFrame: "readonly",
  self: "readonly",
  setTimeout: "readonly",
  structuredClone: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  window: "readonly"
};

export default [
  {
    ignores: ["js/app.bundle.js", "node_modules/**"]
  },
  {
    files: ["eslint.config.js", "js/main.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    }
  },
  {
    files: ["js/*.js", "sw.js"],
    ignores: ["js/main.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: browserGlobals
    },
    rules: {
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["warn", { "args": "none" }]
    }
  }
];
