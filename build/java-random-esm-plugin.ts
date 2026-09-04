import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const JAVA_RANDOM_ID = "\0java-random-esm";

const SECRET_NEEDLE =
  "t.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner";
const SECRET_REPLACEMENT =
  "(t.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED||{ReactCurrentOwner:{current:null}}).ReactCurrentOwner||{current:null}";

function isJavaRandomSpecifier(id: string) {
  const normalized = id.split("?")[0].replace(/\\/g, "/");
  return (
    normalized === "java-random" ||
    normalized === "java-random/lib/index.js" ||
    normalized.endsWith("/java-random/lib/index.js")
  );
}

function patchVosviewerReact19(code: string) {
  let next = code;
  if (next.includes("findDOMNode(") && !next.includes("function __insFindDOMNode")) {
    next = next.replace(
      /\(0,([A-Za-z_$][\w$]*)\.findDOMNode\)/g,
      "__insFindDOMNode",
    );
    next = next.replace(
      /[A-Za-z_$][\w$]*\.findDOMNode\(/g,
      "__insFindDOMNode(",
    );
    next = `function __insFindDOMNode(node){return node&&(node.nodeType===1||node.nodeType===3)?node:null}\n${next}`;
  }
  if (next.includes(SECRET_NEEDLE)) {
    next = next.replace(SECRET_NEEDLE, SECRET_REPLACEMENT);
  }
  if (next.includes("B.jsx=C,B.jsxs=C")) {
    next = next.replace("B.jsx=C,B.jsxs=C", "B.jsx=__insJsx.jsx,B.jsxs=__insJsx.jsxs");
  } else if (next.includes("B.jsx = C, B.jsxs = C")) {
    next = next.replace(
      "B.jsx = C, B.jsxs = C",
      "B.jsx = __insJsx.jsx, B.jsxs = __insJsx.jsxs",
    );
  }
  if (
    next.includes("__insJsx") &&
    !next.includes("from\"react/jsx-runtime\"") &&
    !next.includes("from \"react/jsx-runtime\"")
  ) {
    if (next.startsWith("import*as A from\"react\";")) {
      next = next.replace(
        "import*as A from\"react\";",
        "import*as A from\"react\";import*as __insJsx from\"react/jsx-runtime\";",
      );
    } else {
      next = `import * as __insJsx from "react/jsx-runtime";\n${next}`;
    }
  }
  return next;
}

export function vosviewerReact19Plugin(): Plugin {
  return {
    name: "vosviewer-react19",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.split("?")[0].replace(/\\/g, "/");
      if (!normalized.includes("/vosviewer-online/")) return;
      const next = patchVosviewerReact19(code);
      if (next === code) return;
      return next;
    },
  };
}

export function vosviewerOptimizeDeps() {
  return {
    exclude: ["maplibre-gl"],
    include: [
      "vosviewer-online",
      "@deck.gl/extensions",
      "@deck.gl/mesh-layers",
      "@deck.gl/geo-layers",
    ],
    rolldownOptions: {
      plugins: [
        {
          name: "vosviewer-react19-rolldown",
          transform(code: string, id: string) {
            const normalized = id.split("?")[0].replace(/\\/g, "/");
            if (!normalized.includes("/vosviewer-online/")) return;
            const next = patchVosviewerReact19(code);
            if (next === code) return;
            return next;
          },
        },
      ],
    },
  };
}

export function javaRandomEsmPlugin(): Plugin {
  const sourcePath = require.resolve("java-random/lib/index.js");
  return {
    name: "java-random-esm",
    enforce: "pre",
    resolveId(id) {
      if (isJavaRandomSpecifier(id)) return JAVA_RANDOM_ID;
    },
    load(id) {
      if (id !== JAVA_RANDOM_ID) return;
      const source = readFileSync(sourcePath, "utf8");
      return source.replace(
        "module.exports = class JavaRandom {",
        "export default class JavaRandom {",
      );
    },
  };
}
