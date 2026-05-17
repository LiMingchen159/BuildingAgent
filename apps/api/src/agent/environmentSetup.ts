export type MissingEnvironmentKind = "python" | "node" | "system" | "generic";

export interface MissingEnvironmentIssue {
  kind: MissingEnvironmentKind;
  detail: string;
}

const PYTHON_MODULE_RE = /No module named ['"]([^'"]+)['"]|ModuleNotFoundError: No module named ['"]?([^'"\s]+)/i;
const IMPORT_ERROR_RE = /ImportError: cannot import name ['"]?([^'"\s]+)/i;
const NODE_MODULE_RE = /Cannot find module ['"]([^'"]+)['"]|Error: Cannot find module/i;
const COMMAND_NOT_FOUND_RE = /(?:^|[:\s])([A-Za-z0-9._-]+):?\s*(?:command not found|not found)|is not recognized as an internal or external command[:\s]+['"]?([^\s'"]+)/i;
const PIP_MISSING_RE = /No module named pip|pip.*not found/i;

export function detectMissingEnvironment(output: string): MissingEnvironmentIssue | null {
  const text = output.trim();
  if (!text) {
    return null;
  }

  const pythonMatch = text.match(PYTHON_MODULE_RE);
  if (pythonMatch) {
    const moduleName = pythonMatch[1] ?? pythonMatch[2] ?? "unknown";
    return { kind: "python", detail: moduleName };
  }
  if (/ModuleNotFoundError|ImportError:/i.test(text)) {
    const importMatch = text.match(IMPORT_ERROR_RE);
    return { kind: "python", detail: importMatch?.[1] ?? "dependency" };
  }
  if (PIP_MISSING_RE.test(text)) {
    return { kind: "python", detail: "pip" };
  }

  if (NODE_MODULE_RE.test(text) || /npm ERR!/i.test(text)) {
    const nodeMatch = text.match(NODE_MODULE_RE);
    return { kind: "node", detail: nodeMatch?.[1] ?? "package" };
  }

  if (COMMAND_NOT_FOUND_RE.test(text) || /command not found/i.test(text) || /: not found\n/i.test(text)) {
    const cmdMatch = text.match(COMMAND_NOT_FOUND_RE);
    return { kind: "system", detail: cmdMatch?.[1] ?? cmdMatch?.[2] ?? "command" };
  }

  if (/PackageNotFoundError|DLL load failed|lib.*\.so.*cannot open shared object/i.test(text)) {
    return { kind: "generic", detail: "native dependency" };
  }

  return null;
}

export function buildEnvironmentSetupHint(output: string): string | null {
  const issue = detectMissingEnvironment(output);
  if (!issue) {
    return null;
  }

  const installSteps: string[] = [
    "ENVIRONMENT SETUP REQUIRED — configure the runtime before continuing.",
    "Do NOT answer the user yet, approximate results manually, or skip charts/analysis because tooling is missing.",
    "Install/fix the dependency, verify it works, then retry the exact failed command or execute_code."
  ];

  switch (issue.kind) {
    case "python":
      installSteps.push(
        `Missing Python module: ${issue.detail}.`,
        "Use terminal to install, then verify with a one-line import:",
        `  python3 -m pip install --break-system-packages ${guessPipPackage(issue.detail)}`,
        "If that fails, try: python3 -m pip install --user <package>",
        "On Debian/Ubuntu you may also use: apt-get install -y python3-<pkg> (when available).",
        "After install succeeds, rerun the failed Python step — do not switch to a workaround."
      );
      break;
    case "node":
      installSteps.push(
        `Missing Node package: ${issue.detail}.`,
        "In the Repository directory (REPO_DIR), run: npm install <package> or npm ci if package.json exists.",
        "Retry the failed command after install."
      );
      break;
    case "system":
      installSteps.push(
        `Missing CLI/tool: ${issue.detail}.`,
        "Install the system package (e.g. apt-get install) or the project-specific binary, verify --version, then retry.",
        "Do not substitute a different tool without installing the intended one first."
      );
      break;
    default:
      installSteps.push(
        "A runtime dependency is missing.",
        "Use terminal to install required packages (pip, npm, apt, etc.), verify, then retry."
      );
      break;
  }

  return installSteps.join("\n");
}

/** Map common import names to pip distribution names. */
function guessPipPackage(moduleName: string): string {
  const map: Record<string, string> = {
    sklearn: "scikit-learn",
    cv2: "opencv-python",
    PIL: "Pillow",
    yaml: "pyyaml",
    skimage: "scikit-image"
  };
  const base = moduleName.split(".")[0] ?? moduleName;
  return map[base] ?? base;
}

export function augmentToolResultForEnvironment(
  result: Record<string, unknown>,
  combinedOutput: string
): Record<string, unknown> {
  const hint = buildEnvironmentSetupHint(combinedOutput);
  if (!hint) {
    return result;
  }

  const augmented: Record<string, unknown> = {
    ...result,
    environmentSetupRequired: true,
    environmentSetupHint: hint
  };

  if (typeof result.output === "string") {
    augmented.output = `${result.output}\n\n${hint}`;
  }
  if (typeof result.stdout === "string") {
    augmented.stdout = `${result.stdout}\n\n${hint}`;
  } else if (typeof result.stderr === "string") {
    augmented.stderr = `${result.stderr}\n\n${hint}`;
  }

  return augmented;
}
