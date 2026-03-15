import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Use the shared Select components from src/components/ui/select.tsx instead of a native <select>.",
        },
        {
          selector: "JSXOpeningElement[name.name='option']",
          message:
            "Use the shared Select components from src/components/ui/select.tsx instead of a native <option>.",
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "useAgentNodesRuntime",
            "useAgentConnectionRuntime",
            "useAgentGraphRuntime",
            "useAgentHistoryRuntime",
            "useAgentActivityRuntime",
            "useAgentRuntime",
            "useAgentUI",
            "useAgent",
          ],
        },
      ],
    },
  },
  prettierConfig,
]);
