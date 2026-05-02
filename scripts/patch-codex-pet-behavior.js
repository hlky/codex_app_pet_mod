const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");

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
const appRootDir = path.dirname(resourcesDir);
const extractedDir = `${asarPath}.extracted`;
const backupAsarPath = path.join(resourcesDir, "app.asar.backup-before-pet-patch");
const backupExePath = path.join(appRootDir, "Codex.exe.backup-before-pet-patch");
const chunkBackupDir = path.join(resourcesDir, "pet-patch-backups");
const codexExePath = path.join(appRootDir, "Codex.exe");

const workspaceFile = path.join(
  extractedDir,
  ".vite",
  "build",
  "workspace-root-drop-handler-B4gQVO2J.js",
);
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

function assertExists(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function writeIfChanged(file, next) {
  const previous = read(file);
  if (previous !== next) {
    fs.writeFileSync(file, next);
    return true;
  }
  return false;
}

function replaceExact(source, before, after) {
  if (source.includes(before)) {
    return source.replace(before, after);
  }
  if (source.includes(after)) {
    return source;
  }
  throw new Error(`Pattern not found: ${before.slice(0, 160)}`);
}

function replaceBetween(source, start, end, replacement) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`Start marker not found: ${start}`);
  }
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex === -1) {
    throw new Error(`End marker not found after ${start}: ${end}`);
  }
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

function patchWorkspaceLoader(file) {
  let source = read(file);

  source = replaceExact(
    source,
    "let i=nh.safeParse(JSON.parse(await L.readFile(a,t)));if(!i.success)return null;",
    "let p=JSON.parse(await L.readFile(a,t)),i=nh.safeParse(p);if(!i.success)return null;",
  );

  source = replaceExact(
    source,
    "description:i.data.description,spritesheetDataUrl:",
    "description:i.data.description,animationConfig:p.animation??p.sequences??null,spritesheetDataUrl:",
  );

  return writeIfChanged(file, source);
}

function patchCodexAvatar(file) {
  let source = read(file);

  source = replaceExact(
    source,
    "function m(e){return e==null||e.length===0?p:[...p,...e.map(e=>({assetRef:`codex`,description:e.description,displayName:e.displayName,id:e.id,spritesheetUrl:e.spritesheetDataUrl}))]}",
    "function m(e){return e==null||e.length===0?p:[...p,...e.map(e=>({assetRef:`codex`,animationConfig:e.animationConfig??null,description:e.description,displayName:e.displayName,id:e.id,spritesheetUrl:e.spritesheetDataUrl}))]}",
  );

  source = replaceExact(
    source,
    "M=[{rowIndex:0,columnIndex:0,frameDurationMs:280},{rowIndex:0,columnIndex:1,frameDurationMs:110},{rowIndex:0,columnIndex:2,frameDurationMs:110},{rowIndex:0,columnIndex:3,frameDurationMs:140},{rowIndex:0,columnIndex:4,frameDurationMs:140},{rowIndex:0,columnIndex:5,frameDurationMs:320}],N=M.map",
    "M=L(0,8,140,320),N=M.map",
  );

  source = replaceExact(
    source,
    'P={failed:L(5,8,140,240),idle:M,jumping:L(4,5,140,280),review:L(8,6,150,280),running:L(7,6,120,220),"running-left":L(2,8,120,220),"running-right":L(1,8,120,220),waving:L(3,4,140,280),waiting:L(6,6,150,260)};',
    'P={failed:L(5,8,140,240),idle:M,jumping:L(4,8,140,280),review:L(8,6,150,280),running:L(7,6,120,220),"running-left":L(2,8,120,220),"running-right":L(1,8,120,220),waving:L(3,4,140,280),waiting:L(6,6,150,260)};',
  );

  source = replaceBetween(
    source,
    "function F(e){",
    "function L(e,t,n,r){",
    "function F(e){let{avatarRef:t,isAnimationEnabled:n,prefersReducedMotion:r,state:i,animationConfig:a,detectedFrameCounts:o}=e,s=n===void 0?!0:n,c=i===void 0?`idle`:i;(0,d.useEffect)(()=>{let e=t.current;if(e==null)return;let n=I(c,r||!s,a,o),i=n.frames,p=0,l=null;if(i.length===0)return;if(e.style.backgroundPosition=R(i[p]),i.length===1)return;let u=()=>{l=window.setTimeout(()=>{let t=p+1;if(t>=i.length){if(n.loopStartIndex!=null){p=n.loopStartIndex,e.style.backgroundPosition=R(i[p]),u();return}l=null;return}p=t,e.style.backgroundPosition=R(i[p]),u()},i[p].frameDurationMs)};return u(),()=>{l!=null&&window.clearTimeout(l)}},[t,s,r,c,a,o])}function I(e,t,n,r){let i=Y(e,n,r);if(t)return{frames:[i[0]??P[e]?.[0]??P.idle[0]],loopStartIndex:null};if(e===`idle`)return{frames:$(i,n,e),loopStartIndex:0};let a=X(e,n),o=a?a.flatMap(e=>$(Y(e,n,r),n,e)):[...i,...i,...i],s=Y(`idle`,n,r),c=o.length;return{frames:[...o,...$(s,n,`idle`)],loopStartIndex:c}}function X(e,t){let n=t?.chains?.[e]??{review:[`review`,`waving`],failed:[`failed`,`waiting`],waiting:[`waiting`,`waving`],jumping:[`jumping`,`waving`]}[e];return Array.isArray(n)&&n.length>0?n:null}function Y(e,t,n){let r=t?.states?.[e],i=P[e]??P.idle,a=r?.rowIndex??r?.row??i[0]?.rowIndex??0,o=Number.isFinite(r?.frames)?r.frames:Number.isFinite(r?.frameCount)?r.frameCount:n?.[a]??i.length,s=Math.max(1,Math.min(k,Math.trunc(o))),c=Number.isFinite(r?.durationMs)?r.durationMs:Number.isFinite(r?.frameDurationMs)?r.frameDurationMs:i[0]?.frameDurationMs??140,l=Number.isFinite(r?.lastFrameDurationMs)?r.lastFrameDurationMs:i.at(-1)?.frameDurationMs??c;return L(a,s,c,l)}function $(e,t,n){let r=t?.states?.[n],i=Number.isFinite(r?.slowdown)?r.slowdown:n===`idle`?t?.idleSlowdown??j:1;return i===1?e:e.map(e=>({...e,frameDurationMs:e.frameDurationMs*i}))}",
  );

  source = replaceBetween(
    source,
    "var z=o(),B=",
    "function H(e){",
    'var z=o(),B={bsod:x,codex:S,dewey:C,fireball:w,"null-signal":T,rocky:E,seedy:D,stacky:O},J=new Map;function q(e){if(e==null)return Promise.resolve(null);if(J.has(e))return J.get(e);let t=new Promise((t,n)=>{let r=new Image;r.onload=()=>{try{let n=document.createElement(`canvas`),i=r.naturalWidth||r.width,a=r.naturalHeight||r.height;n.width=i,n.height=a;let o=n.getContext(`2d`,{willReadFrequently:!0});if(o==null){t(null);return}o.drawImage(r,0,0);let s=Math.floor(i/k),c=Math.floor(a/A),l=[];for(let e=0;e<A;e++){let t=0;for(let n=0;n<k;n++){let r=o.getImageData(n*s,e*c,s,c).data,i=!1;for(let e=3;e<r.length;e+=4)if(r[e]>8){i=!0;break}i&&(t=n+1)}l[e]=t}t(l)}catch(e){n(e)}};r.onerror=()=>n(Error(`Unable to inspect pet spritesheet`));r.src=e});return J.set(e,t),t}function V(e){let{assetRef:n,className:r,spritesheetUrl:i,state:a,animationConfig:o}=e,s=a===void 0?`idle`:a,c=(0,d.useRef)(null),[l,u]=(0,d.useState)(null),p=f(),m=H(n),h=i??B[m];(0,d.useEffect)(()=>{if(o?.autoDetectFrames===!1){u(null);return}let e=!1;return q(h).then(t=>{e||u(t)}).catch(()=>{e||u(null)}),()=>{e=!0}},[h,o?.autoDetectFrames]),F({avatarRef:c,prefersReducedMotion:p,state:s,animationConfig:o,detectedFrameCounts:l});let g=`codex-avatar-root`;g=r==null?g:`${g} ${r}`;let _=`url(${h})`;return(0,z.jsx)(`div`,{ref:c,className:g,"data-avatar-asset-ref":m,"data-avatar-state":s,style:{backgroundImage:_},"aria-hidden":`true`,"data-testid":`codex-avatar`})}',
  );

  source = replaceExact(
    source,
    "function H(e){function H(e){return U(e)?e:`codex`}",
    "function H(e){return U(e)?e:`codex`}",
  );

  if (source.includes("let n=I(c,r||!s,a,o),i=n.frames,a=0")) {
    throw new Error("Patched avatar animation still contains a TDZ-prone frame index");
  }

  return writeIfChanged(file, source);
}

function patchOverlay(file) {
  let source = read(file);

  source = replaceExact(
    source,
    "{ariaLabel:n,assetRef:r,className:i,notificationBadge:a,onContextMenu:o,spritesheetUrl:s,state:c,transientState:l}=e,u=c===void 0?`idle`:c",
    "{ariaLabel:n,assetRef:r,className:i,notificationBadge:a,onContextMenu:o,spritesheetUrl:s,state:c,transientState:l,animationConfig:te}=e,u=c===void 0?`idle`:c",
  );

  source = replaceExact(
    source,
    "m=l??(d?`jumping`:u)",
    "m=l??(d?(te?.events?.hover??`jumping`):u)",
  );

  source = replaceExact(
    source,
    "(0,G.jsx)(E,{assetRef:r,className:`relative z-10`,spritesheetUrl:s,state:m})",
    "(0,G.jsx)(E,{assetRef:r,animationConfig:te,className:`relative z-10`,spritesheetUrl:s,state:m})",
  );

  source = replaceExact(
    source,
    "assetRef:n.assetRef,spritesheetUrl:n.spritesheetUrl,notificationBadge:R,state:A.mascotState,transientState:c})",
    "assetRef:n.assetRef,animationConfig:n.animationConfig,spritesheetUrl:n.spritesheetUrl,notificationBadge:R,state:A.mascotState,transientState:c})",
  );

  source = replaceExact(
    source,
    "s(e=>ut({currentDragState:e,deltaX:r})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
    "s(e=>ut({currentDragState:e,deltaX:r,deltaY:i})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
  );

  source = replaceExact(
    source,
    "function ut({currentDragState:e,deltaX:t}){return t>=Ge?`running-right`:t<=-Ge?`running-left`:e}",
    "function ut({currentDragState:e,deltaX:t,deltaY:n}){return t>=Ge?`running-right`:t<=-Ge?`running-left`:n<=-Ge?`waving`:n>=Ge?`jumping`:e}",
  );

  return writeIfChanged(file, source);
}

function readAsarHeaderBytes(file) {
  const fd = fs.openSync(file, "r");
  try {
    const prefix = Buffer.alloc(16);
    if (fs.readSync(fd, prefix, 0, prefix.length, 0) !== prefix.length) {
      throw new Error(`Unable to read asar header prefix: ${file}`);
    }
    const headerSize = prefix.readUInt32LE(4);
    const headerJsonSize = prefix.readUInt32LE(12);
    if (headerJsonSize <= 0 || headerJsonSize > headerSize) {
      throw new Error(`Unexpected asar header size in ${file}`);
    }
    const header = Buffer.alloc(headerJsonSize);
    if (fs.readSync(fd, header, 0, header.length, 16) !== header.length) {
      throw new Error(`Unable to read asar header JSON: ${file}`);
    }
    return header;
  } finally {
    fs.closeSync(fd);
  }
}

function getAsarHeaderHash(file) {
  return crypto.createHash("sha256").update(readAsarHeaderBytes(file)).digest("hex");
}

function patchExecutableAsarIntegrity(exeFile, nextHash) {
  if (!fs.existsSync(exeFile)) {
    console.warn(`Skipping executable integrity update; missing ${exeFile}`);
    return false;
  }

  const marker = '"file":"resources\\\\app.asar","alg":"SHA256","value":"';
  const exe = fs.readFileSync(exeFile);
  const source = exe.toString("latin1");
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`Unable to find embedded app.asar integrity metadata in ${exeFile}`);
  }

  const hashStart = markerIndex + marker.length;
  const previousHash = source.slice(hashStart, hashStart + 64);
  if (!/^[0-9a-f]{64}$/i.test(previousHash)) {
    throw new Error(`Unexpected embedded app.asar integrity value in ${exeFile}`);
  }
  if (previousHash.toLowerCase() === nextHash) {
    return false;
  }

  copyIfMissing(exeFile, backupExePath);
  Buffer.from(nextHash, "ascii").copy(exe, hashStart);
  fs.writeFileSync(exeFile, exe);
  console.log(`Updated Codex.exe app.asar integrity: ${previousHash} -> ${nextHash}`);
  return true;
}

assertExists(asarPath);

if (!fs.existsSync(extractedDir)) {
  run("asar", ["extract", asarPath, extractedDir]);
}

assertExists(extractedDir);
assertExists(workspaceFile);
assertExists(avatarFile);
assertExists(overlayFile);

fs.mkdirSync(chunkBackupDir, { recursive: true });
copyIfMissing(asarPath, backupAsarPath);
copyIfMissing(
  workspaceFile,
  path.join(
    chunkBackupDir,
    "workspace-root-drop-handler-B4gQVO2J.js.backup-before-pet-patch",
  ),
);
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

const changed =
  patchWorkspaceLoader(workspaceFile) |
  patchCodexAvatar(avatarFile) |
  patchOverlay(overlayFile);

run("asar", ["pack", extractedDir, asarPath]);

const integrityChanged = patchExecutableAsarIntegrity(
  codexExePath,
  getAsarHeaderHash(asarPath),
);

console.log(
  changed || integrityChanged
    ? "Patched and repacked copied Codex app pet behavior."
    : "Patch was already present; repacked copied Codex app.",
);
