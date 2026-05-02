const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const [, , asarArg] = process.argv;

if (asarArg == null || asarArg === "--help" || asarArg === "-h") {
  console.error(
    [
      "Usage:",
      "  node scripts/patch-codex-pet-behavior.js <path-to-app.asar>",
      "",
      "Example:",
      "  node scripts/patch-codex-pet-behavior.js H:\\codex_app\\app\\resources\\app.asar",
    ].join("\n"),
  );
  process.exit(asarArg == null ? 1 : 0);
}

const asarPath = path.resolve(asarArg);
const resourcesDir = path.dirname(asarPath);
const extractedDir = `${asarPath}.extracted`;
const backupAsarPath = path.join(resourcesDir, "app.asar.backup-before-pet-patch");
const chunkBackupDir = path.join(resourcesDir, "pet-patch-backups");

const avatarFile = path.join(
  extractedDir,
  "webview",
  "assets",
  "codex-avatar-BpKnWN_W.js",
);
const overlayFile = path.join(
  extractedDir,
  "webview",
  "assets",
  "avatar-overlay-page-Dj9Zinq_.js",
);

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function copyIfMissing(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.copyFileSync(source, destination);
  }
}

function replaceOnce(file, before, after) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes(before)) {
    if (original.includes(after)) {
      return false;
    }
    throw new Error(`Pattern not found in ${file}: ${before.slice(0, 120)}`);
  }
  fs.writeFileSync(file, original.replace(before, after));
  return true;
}

function assertExists(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

assertExists(asarPath);
assertExists(extractedDir);
assertExists(avatarFile);
assertExists(overlayFile);

fs.mkdirSync(chunkBackupDir, { recursive: true });
copyIfMissing(asarPath, backupAsarPath);
copyIfMissing(
  avatarFile,
  path.join(chunkBackupDir, "codex-avatar-BpKnWN_W.js.backup-before-pet-patch"),
);
copyIfMissing(
  overlayFile,
  path.join(
    chunkBackupDir,
    "avatar-overlay-page-Dj9Zinq_.js.backup-before-pet-patch",
  ),
);

let changed = false;

changed =
  replaceOnce(
    avatarFile,
    "M=[{rowIndex:0,columnIndex:0,frameDurationMs:280},{rowIndex:0,columnIndex:1,frameDurationMs:110},{rowIndex:0,columnIndex:2,frameDurationMs:110},{rowIndex:0,columnIndex:3,frameDurationMs:140},{rowIndex:0,columnIndex:4,frameDurationMs:140},{rowIndex:0,columnIndex:5,frameDurationMs:320}],N=M.map",
    "M=L(0,8,140,320),N=M.map",
  ) || changed;

changed =
  replaceOnce(
    avatarFile,
    'P={failed:L(5,8,140,240),idle:M,jumping:L(4,5,140,280),review:L(8,6,150,280),running:L(7,6,120,220),"running-left":L(2,8,120,220),"running-right":L(1,8,120,220),waving:L(3,4,140,280),waiting:L(6,6,150,260)};',
    'P={failed:L(5,8,140,240),idle:M,jumping:L(4,8,140,280),review:L(8,6,150,280),running:L(7,6,120,220),"running-left":L(2,8,120,220),"running-right":L(1,8,120,220),waving:L(3,4,140,280),waiting:L(6,6,150,260)};',
  ) || changed;

changed =
  replaceOnce(
    avatarFile,
    "function I(e,t){let n=P[e];if(t)return{frames:[n[0]],loopStartIndex:null};if(e===`idle`)return{frames:N,loopStartIndex:0};let r=[...n,...n,...n];return{frames:[...r,...N],loopStartIndex:r.length}}",
    "function I(e,t){let n=P[e];if(t)return{frames:[n[0]],loopStartIndex:null};if(e===`idle`)return{frames:N,loopStartIndex:0};let r={review:[`review`,`waving`],failed:[`failed`,`waiting`],waiting:[`waiting`,`waving`],jumping:[`jumping`,`waving`]}[e],i=r?r.flatMap(e=>P[e]):[...n,...n,...n];return{frames:[...i,...N],loopStartIndex:i.length}}",
  ) || changed;

changed =
  replaceOnce(
    overlayFile,
    "s(e=>ut({currentDragState:e,deltaX:r})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
    "s(e=>ut({currentDragState:e,deltaX:r,deltaY:i})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
  ) || changed;

changed =
  replaceOnce(
    overlayFile,
    "function ut({currentDragState:e,deltaX:t}){return t>=Ge?`running-right`:t<=-Ge?`running-left`:e}",
    "function ut({currentDragState:e,deltaX:t,deltaY:n}){return t>=Ge?`running-right`:t<=-Ge?`running-left`:n<=-Ge?`waving`:n>=Ge?`jumping`:e}",
  ) || changed;

run("asar", ["pack", extractedDir, asarPath]);

console.log(
  changed
    ? "Patched and repacked copied Codex app pet behavior."
    : "Patch was already present; repacked copied Codex app.",
);
