import globals from "globals";
export default [
  { ignores: ["node_modules/**", "work/**"] },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        GPUBufferUsage: "readonly",
        GPUMapMode: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-unreachable": "error",
      "no-constant-condition": "error",
      eqeqeq: "error",
    },
  },
];
