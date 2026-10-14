import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "src-tauri"] },
  { linterOptions: { noInlineConfig: true } },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "no-console": "error",
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use genId() from utils/id.ts." },
        { property: "randomUUID", message: "Use genId() from utils/id.ts." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "lucide-react", message: "Icons come from @phosphor-icons/react." },
            { name: "nanoid", message: "Use genId() from utils/id.ts." },
            { name: "uuid", message: "Use genId() from utils/id.ts." },
            {
              name: "@tauri-apps/plugin-dialog",
              importNames: ["message", "ask", "confirm"],
              message:
                "Use a sonner toast or the app's Modal: native dialogs look foreign and devctl can't drive them.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='@phosphor-icons/react'] ImportSpecifier[imported.name!=/^(Icon(?:[A-Z]\\w*)?|\\w+Icon)$/]",
          message: "Import Phosphor icons as `XIcon as X`.",
        },
        {
          selector:
            "ImportDeclaration[source.value='@phosphor-icons/react'] ImportNamespaceSpecifier",
          message: "Import Phosphor icons as `XIcon as X`.",
        },
        {
          selector: "JSXAttribute[name.name='target'][value.value='_blank']",
          message:
            "The WebView blocks target=_blank: open links with @tauri-apps/plugin-opener.",
        },
      ],
    },
  },
  {
    files: ["src/utils/id.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["src/**/index.ts", "src/**/index.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "Program", message: "No barrel files: import the source file." },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/consistent-type-assertions": "off" },
  },
  prettier,
);
