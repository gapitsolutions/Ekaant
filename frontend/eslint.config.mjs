import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      ".next/**",
      ".next-build/**",
      ".next-build2/**",
      ".next-build3/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "tsconfig.tsbuildinfo",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {},
  },
];
