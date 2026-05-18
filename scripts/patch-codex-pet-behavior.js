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
const repoRoot = path.resolve(__dirname, "..");
const advancedPetSystemSourcePath = path.join(repoRoot, "src", "advanced-pet-system.ts");
const advancedPetSystemBuildPath = path.join(repoRoot, "dist", "src", "advanced-pet-system.js");

const workspaceBuildDir = path.join(extractedDir, ".vite", "build");
const webviewAssetsDir = path.join(extractedDir, "webview", "assets");

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

function runInRepo(command, args) {
  const result = childProcess.spawnSync(command, args, {
    cwd: repoRoot,
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

function ensureAdvancedPetSystemBuild() {
  assertExists(advancedPetSystemSourcePath);
  const needsBuild =
    !fs.existsSync(advancedPetSystemBuildPath) ||
    fs.statSync(advancedPetSystemBuildPath).mtimeMs < fs.statSync(advancedPetSystemSourcePath).mtimeMs;

  if (!needsBuild) {
    return;
  }

  console.log("Building TypeScript Advanced Pet System...");
  try {
    runInRepo("npm", ["run", "build"]);
  } catch (error) {
    throw new Error(
      [
        "Unable to build the TypeScript Advanced Pet System.",
        "Run `npm install` in this repo, then rerun the patch script.",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
    );
  }
}

function listFilesRecursive(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function findChunk(dir, label, matcher) {
  assertExists(dir);
  const matches = listFilesRecursive(dir)
    .filter((file) => file.endsWith(".js"))
    .filter((file) => matcher(read(file), file));

  if (matches.length !== 1) {
    throw new Error(
      `Expected to find exactly one ${label} chunk, found ${matches.length}:\n${matches.join("\n")}`,
    );
  }

  return matches[0];
}

function findOptionalChunk(dir, label, matcher) {
  assertExists(dir);
  const matches = listFilesRecursive(dir)
    .filter((file) => file.endsWith(".js"))
    .filter((file) => matcher(read(file), file));

  if (matches.length > 1) {
    throw new Error(
      `Expected to find at most one ${label} chunk, found ${matches.length}:\n${matches.join("\n")}`,
    );
  }

  return matches[0] ?? null;
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

function replaceOneExact(source, befores, after) {
  if (source.includes(after)) {
    return source;
  }
  for (const before of befores) {
    if (source.includes(before)) {
      return source.replace(before, after);
    }
  }
  throw new Error(`Pattern not found: ${befores[0].slice(0, 160)}`);
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
  const oldParse =
    "let i=nh.safeParse(JSON.parse(await L.readFile(a,t)));if(!i.success)return null;";
  const oldParsePatched =
    "let p=JSON.parse(await L.readFile(a,t)),i=nh.safeParse(p);if(!i.success)return null;";
  const latestParse =
    "let i=Ug.safeParse(JSON.parse(await R.readFile(a,t)));if(!i.success)return null;";
  const latestParsePatched =
    "let p=JSON.parse(await R.readFile(a,t)),i=Ug.safeParse(p);if(!i.success)return null;";

  if (source.includes(oldParse) || source.includes(oldParsePatched)) {
    source = replaceExact(source, oldParse, oldParsePatched);
  } else {
    source = replaceExact(source, latestParse, latestParsePatched);
  }

  source = replaceExact(
    source,
    "description:i.data.description,spritesheetDataUrl:",
    "description:i.data.description,animationConfig:p.animation??p.sequences??null,spritesheetDataUrl:",
  );

  return writeIfChanged(file, source);
}

function patchCodexAvatar(file) {
  let source = read(file);

  if (source.includes("function g(e){return e==null||e.length===0?h:")) {
    source = replaceExact(
      source,
      "function g(e){return e==null||e.length===0?h:[...h,...e.map(e=>({assetRef:`codex`,description:e.description,displayName:e.displayName,id:e.id,spritesheetUrl:e.spritesheetDataUrl}))]}",
      "function g(e){return e==null||e.length===0?h:[...h,...e.map(e=>({assetRef:`codex`,animationConfig:e.animationConfig??null,description:e.description,displayName:e.displayName,id:e.id,spritesheetUrl:e.spritesheetDataUrl}))]}",
    );

    source = replaceExact(
      source,
      "N=[{rowIndex:0,columnIndex:0,frameDurationMs:280},{rowIndex:0,columnIndex:1,frameDurationMs:110},{rowIndex:0,columnIndex:2,frameDurationMs:110},{rowIndex:0,columnIndex:3,frameDurationMs:140},{rowIndex:0,columnIndex:4,frameDurationMs:140},{rowIndex:0,columnIndex:5,frameDurationMs:320}],P=N.map",
      "N=R(0,8,140,320),P=N.map",
    );

    source = replaceExact(
      source,
      'F={failed:R(5,8,140,240),idle:N,jumping:R(4,5,140,280),review:R(8,6,150,280),running:R(7,6,120,220),"running-left":R(2,8,120,220),"running-right":R(1,8,120,220),waving:R(3,4,140,280),waiting:R(6,6,150,260)};',
      'F={failed:R(5,8,140,240),idle:N,jumping:R(4,8,140,280),review:R(8,6,150,280),running:R(7,6,120,220),"running-left":R(2,8,120,220),"running-right":R(1,8,120,220),waving:R(3,4,140,280),waiting:R(6,6,150,260)};',
    );

    source = replaceBetween(
      source,
      "function I(e){",
      "function R(e,t,n,r){",
      [
        "function I(e){let{avatarRef:t,isAnimationEnabled:n,prefersReducedMotion:r,state:i,animationConfig:a,detectedFrameCounts:o}=e,s=n===void 0?!0:n,c=i===void 0?`idle`:i;(0,f.useEffect)(()=>{let e=t.current;if(e==null)return;let n=petBuild(c,r||!s,a,o),i=n.frames,p=0,l=null;if(i.length===0)return;if(e.style.backgroundPosition=z(i[p]),i.length===1)return;let u=()=>{l=window.setTimeout(()=>{let t=p+1;if(t>=i.length){if(n.loopStartIndex!=null){p=n.loopStartIndex,e.style.backgroundPosition=z(i[p]),u();return}l=null;return}p=t,e.style.backgroundPosition=z(i[p]),u()},i[p].frameDurationMs)};return u(),()=>{l!=null&&window.clearTimeout(l)}},[t,s,r,c,a,o])}",
        "function petBuild(e,t,n,r){let i=petState(e,n,r);if(t)return{frames:[i[0]??F[e]?.[0]??F.idle[0]],loopStartIndex:null};let a=petChain(e,n);if(e===`idle`){let e=petIdle(a,n,r);return{frames:e,loopStartIndex:0}}let o=a?a.flatMap(e=>petSlow(petState(e,n,r),n,e)):[...i,...i,...i],s=petMode(e,n);if(s===`loop`)return{frames:o,loopStartIndex:0};if(s===`once`)return{frames:o,loopStartIndex:null};let c=petIdle(petChain(`idle`,n),n,r),l=o.length;return{frames:[...o,...c],loopStartIndex:l}}",
        "function petChain(e,t){let n=t?.chains?.[e]??{review:[`review`,`waving`],failed:[`failed`,`waiting`],waiting:[`waiting`,`waving`],jumping:[`jumping`,`waving`]}[e];if(n&&Array.isArray(n.sequence))n=n.sequence;return Array.isArray(n)&&n.length>0?n:null}",
        "function petMode(e,t){let n=t?.chains?.[e]?.mode??t?.states?.[e]?.chainMode??t?.states?.[e]?.chainPlayback??t?.chainMode??t?.chainPlayback??t?.loopActiveChains;if(n===!0)return`loop`;if(n===!1)return`idleFallback`;return n===`loop`?`loop`:n===`once`?`once`:`idleFallback`}",
        "function petIdle(e,t,n){return e?e.flatMap(e=>petSlow(petState(e,t,n),t,e)):petSlow(petState(`idle`,t,n),t,`idle`)}",
        "function petState(e,t,n){let r=t?.states?.[e],i=F[e]??F.idle,a=r?.rowIndex??r?.row??i[0]?.rowIndex??0,o=Number.isFinite(r?.frames)?r.frames:Number.isFinite(r?.frameCount)?r.frameCount:n?.[a]??i.length,s=Math.max(1,Math.min(A,Math.trunc(o))),c=Number.isFinite(r?.durationMs)?r.durationMs:Number.isFinite(r?.frameDurationMs)?r.frameDurationMs:i[0]?.frameDurationMs??140,l=Number.isFinite(r?.lastFrameDurationMs)?r.lastFrameDurationMs:i.at(-1)?.frameDurationMs??c;return R(a,s,c,l)}",
        "function petSlow(e,t,n){let r=t?.states?.[n],i=Number.isFinite(r?.slowdown)?r.slowdown:n===`idle`?t?.idleSlowdown??M:1;return i===1?e:e.map(e=>({...e,frameDurationMs:e.frameDurationMs*i}))}",
      ].join(""),
    );

    source = replaceBetween(
      source,
      "var B=o(),V=",
      "function U(e){",
      'var B=o(),V={bsod:S,codex:C,dewey:w,fireball:T,"null-signal":E,rocky:D,seedy:O,stacky:k},detectedPetFrames=new Map;function inspectPetFrames(e){if(e==null)return Promise.resolve(null);if(detectedPetFrames.has(e))return detectedPetFrames.get(e);let t=new Promise((t,n)=>{let r=new Image;r.onload=()=>{try{let n=document.createElement(`canvas`),i=r.naturalWidth||r.width,a=r.naturalHeight||r.height;n.width=i,n.height=a;let o=n.getContext(`2d`,{willReadFrequently:!0});if(o==null){t(null);return}o.drawImage(r,0,0);let s=Math.floor(i/A),c=Math.floor(a/j),l=[];for(let e=0;e<j;e++){let t=0;for(let n=0;n<A;n++){let r=o.getImageData(n*s,e*c,s,c).data,i=!1;for(let e=3;e<r.length;e+=4)if(r[e]>8){i=!0;break}i&&(t=n+1)}l[e]=t}t(l)}catch(e){n(e)}};r.onerror=()=>n(Error(`Unable to inspect pet spritesheet`));r.src=e});return detectedPetFrames.set(e,t),t}function H(e){let{assetRef:n,className:r,spritesheetUrl:i,state:a,animationConfig:o}=e,stateName=a===void 0?`idle`:a,c=(0,f.useRef)(null),l=p(),u=U(n),[d,m]=(0,f.useState)(null),h=i??V[u];(0,f.useEffect)(()=>{if(o?.autoDetectFrames===!1){m(null);return}let e=!1;return inspectPetFrames(h).then(t=>{e||m(t)}).catch(()=>{e||m(null)}),()=>{e=!0}},[h,o?.autoDetectFrames]),I({avatarRef:c,prefersReducedMotion:l,state:stateName,animationConfig:o,detectedFrameCounts:d});let g=s(`codex-avatar-root`,r),_= `url(${h})`;return(0,B.jsx)(`div`,{ref:c,className:g,"data-avatar-asset-ref":u,"data-avatar-state":stateName,style:{backgroundImage:_},"aria-hidden":`true`,"data-testid":`codex-avatar`})}',
    );

    if (source.includes("let n=petBuild(c,r||!s,a,o),i=n.frames,a=0")) {
      throw new Error("Patched avatar animation still contains a TDZ-prone frame index");
    }

    return writeIfChanged(file, source);
  }

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
    [
      "function F(e){let{avatarRef:t,isAnimationEnabled:n,prefersReducedMotion:r,state:i,animationConfig:a,detectedFrameCounts:o}=e,s=n===void 0?!0:n,c=i===void 0?`idle`:i;(0,d.useEffect)(()=>{let e=t.current;if(e==null)return;let n=I(c,r||!s,a,o),i=n.frames,p=0,l=null;if(i.length===0)return;if(e.style.backgroundPosition=R(i[p]),i.length===1)return;let u=()=>{l=window.setTimeout(()=>{let t=p+1;if(t>=i.length){if(n.loopStartIndex!=null){p=n.loopStartIndex,e.style.backgroundPosition=R(i[p]),u();return}l=null;return}p=t,e.style.backgroundPosition=R(i[p]),u()},i[p].frameDurationMs)};return u(),()=>{l!=null&&window.clearTimeout(l)}},[t,s,r,c,a,o])}",
      "function I(e,t,n,r){let i=Y(e,n,r);if(t)return{frames:[i[0]??P[e]?.[0]??P.idle[0]],loopStartIndex:null};let a=X(e,n);if(e===`idle`){let e=W(a,n,r);return{frames:e,loopStartIndex:0}}let o=a?a.flatMap(e=>$(Y(e,n,r),n,e)):[...i,...i,...i],s=G(e,n);if(s===`loop`)return{frames:o,loopStartIndex:0};if(s===`once`)return{frames:o,loopStartIndex:null};let c=W(X(`idle`,n),n,r),l=o.length;return{frames:[...o,...c],loopStartIndex:l}}",
      "function X(e,t){let n=t?.chains?.[e]??{review:[`review`,`waving`],failed:[`failed`,`waiting`],waiting:[`waiting`,`waving`],jumping:[`jumping`,`waving`]}[e];if(n&&Array.isArray(n.sequence))n=n.sequence;return Array.isArray(n)&&n.length>0?n:null}",
      "function G(e,t){let n=t?.chains?.[e]?.mode??t?.states?.[e]?.chainMode??t?.states?.[e]?.chainPlayback??t?.chainMode??t?.chainPlayback??t?.loopActiveChains;if(n===!0)return`loop`;if(n===!1)return`idleFallback`;return n===`loop`?`loop`:n===`once`?`once`:`idleFallback`}",
      "function W(e,t,n){return e?e.flatMap(e=>$(Y(e,t,n),t,e)):$(Y(`idle`,t,n),t,`idle`)}",
      "function Y(e,t,n){let r=t?.states?.[e],i=P[e]??P.idle,a=r?.rowIndex??r?.row??i[0]?.rowIndex??0,o=Number.isFinite(r?.frames)?r.frames:Number.isFinite(r?.frameCount)?r.frameCount:n?.[a]??i.length,s=Math.max(1,Math.min(k,Math.trunc(o))),c=Number.isFinite(r?.durationMs)?r.durationMs:Number.isFinite(r?.frameDurationMs)?r.frameDurationMs:i[0]?.frameDurationMs??140,l=Number.isFinite(r?.lastFrameDurationMs)?r.lastFrameDurationMs:i.at(-1)?.frameDurationMs??c;return L(a,s,c,l)}",
      "function $(e,t,n){let r=t?.states?.[n],i=Number.isFinite(r?.slowdown)?r.slowdown:n===`idle`?t?.idleSlowdown??j:1;return i===1?e:e.map(e=>({...e,frameDurationMs:e.frameDurationMs*i}))}",
    ].join(""),
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

  if (source.includes("import{t as me}from\"./avatar-mascot-button-")) {
    source = replaceExact(
      source,
      "children:(0,Q.jsx)(me,{ariaLabel:ne.formatMessage($.mascotLabel,{petName:e.displayName}),assetRef:e.assetRef,spritesheetUrl:e.spritesheetUrl,notificationBadge:A,resizeHandle:l==null?void 0:{ariaLabel:ne.formatMessage($.resizeMascot),...l},state:T.mascotState,style:s,transientState:c})",
      "children:(0,Q.jsx)(me,{ariaLabel:ne.formatMessage($.mascotLabel,{petName:e.displayName}),assetRef:e.assetRef,animationConfig:e.animationConfig,spritesheetUrl:e.spritesheetUrl,notificationBadge:A,resizeHandle:l==null?void 0:{ariaLabel:ne.formatMessage($.resizeMascot),...l},state:T.mascotState,style:s,transientState:c})",
    );

    source = replaceExact(
      source,
      "if(e.isLoading)return{badgeBackgroundColor:`var(--color-token-activity-bar-badge-background)`,badgeForegroundColor:`var(--color-token-activity-bar-badge-foreground)`,fallbackBodyMessage:Y.runningFallbackBody,iconClassName:`icon-xs shrink-0 text-token-text-secondary`,iconType:`spinner`,labelMessage:Y.running,mascotState:`running`};",
      "if(e.isLoading)return{badgeBackgroundColor:`var(--color-token-activity-bar-badge-background)`,badgeForegroundColor:`var(--color-token-activity-bar-badge-foreground)`,fallbackBodyMessage:Y.runningFallbackBody,iconClassName:`icon-xs shrink-0 text-token-text-secondary`,iconType:`spinner`,labelMessage:Y.running,mascotState:e.petState??`running`};",
    );

    source = replaceExact(
      source,
      "case`warning`:return{badgeBackgroundColor:`var(--color-token-editor-warning-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:Y.waiting,iconClassName:`icon-xs shrink-0 text-token-editor-warning-foreground`,iconType:`clock`,labelMessage:Y.waiting,mascotState:`waiting`};",
      "case`warning`:return{badgeBackgroundColor:`var(--color-token-editor-warning-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:Y.waiting,iconClassName:`icon-xs shrink-0 text-token-editor-warning-foreground`,iconType:`clock`,labelMessage:Y.waiting,mascotState:e.petState??`waiting`};",
    );

    source = replaceExact(
      source,
      "case`danger`:return{badgeBackgroundColor:`var(--color-token-error-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:Y.failed,iconClassName:`icon-xs shrink-0 text-token-error-foreground`,iconType:`warning`,labelMessage:Y.failed,mascotState:`failed`};",
      "case`danger`:return{badgeBackgroundColor:`var(--color-token-error-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:Y.failed,iconClassName:`icon-xs shrink-0 text-token-error-foreground`,iconType:`warning`,labelMessage:Y.failed,mascotState:e.petState??`failed`};",
    );

    source = replaceExact(
      source,
      "case`success`:return{badgeBackgroundColor:`var(--color-token-charts-green)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:Y.review,iconClassName:`icon-xs shrink-0 text-token-charts-green`,iconType:`check-circle`,labelMessage:Y.review,mascotState:`review`};",
      "case`success`:return{badgeBackgroundColor:`var(--color-token-charts-green)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:Y.review,iconClassName:`icon-xs shrink-0 text-token-charts-green`,iconType:`check-circle`,labelMessage:Y.review,mascotState:e.petState??`review`};",
    );

    source = replaceExact(
      source,
      "return{actionPath:`/local/`+e.id,hostId:r,key:i+`:`+r+`:`+e.id,localConversationId:e.id,source:i,status:a,subtitle:We(e,n),title:m(e)??n.formatMessage(X.newThread),turnKey:String(e.turns.length),updatedAtMs:e.updatedAt,waitingRequest:H(o,n)}}",
      "return{actionPath:`/local/`+e.id,hostId:r,key:i+`:`+r+`:`+e.id,localConversationId:e.id,petState:rrPet(e.turns.at(-1)?.items??[]),source:i,status:a,subtitle:We(e,n),title:m(e)??n.formatMessage(X.newThread),turnKey:String(e.turns.length),updatedAtMs:e.updatedAt,waitingRequest:H(o,n)}}",
    );

    source = replaceExact(
      source,
      "return{actionPath:`/remote/`+e.id,hostId:null,key:`cloud:`+e.id,localConversationId:null,source:`cloud`,status:Je(e),subtitle:null,title:e.title?.trim()||t.formatMessage(X.newThread),turnKey:e.task_status_display?.latest_turn_status_display?.turn_id??null,updatedAtMs:n,waitingRequest:null}}",
      "return{actionPath:`/remote/`+e.id,hostId:null,key:`cloud:`+e.id,localConversationId:null,petState:null,source:`cloud`,status:Je(e),subtitle:null,title:e.title?.trim()||t.formatMessage(X.newThread),turnKey:e.task_status_display?.latest_turn_status_display?.turn_id??null,updatedAtMs:n,waitingRequest:null}}",
    );

    const rrPet =
      "function rrPet(e){for(let t=e.length-1;t>=0;--t){let n=e[t];if(n?.type===`commandExecution`){let e=n.commandActions?.at?.(-1),t=n.status===`inProgress`;if(e?.type===`read`)return t?`reading`:`read`;if(e?.type===`listFiles`)return t?`listing`:`listed`;if(e?.type===`search`)return t?`searching`:`searched`;return t?`running-command`:`ran-command`}if(n?.type===`fileChange`)return n.status===`inProgress`?`editing`:`edited`;if(n?.type===`mcpToolCall`)return n.status===`inProgress`?`calling-tool`:`called-tool`;if(n?.type===`webSearch`)return n.status===`inProgress`?`searching-web`:`searched-web`;if(n?.type===`reasoning`)return`thinking`}return null}";
    while (source.indexOf(rrPet) !== source.lastIndexOf(rrPet)) {
      source = source.replace(rrPet, "");
    }
    if (!source.includes(rrPet)) {
      source = replaceExact(
        source,
        "function We(e,t){return Ge(e.turns.at(-1)?.items??[],t)}",
        `function We(e,t){return Ge(e.turns.at(-1)?.items??[],t)}${rrPet}`,
      );
    }

    while (source.includes("petState:e.petState,petState:e.petState,")) {
      source = source.replace(
        "petState:e.petState,petState:e.petState,",
        "petState:e.petState,",
      );
    }

    if (!source.includes("title:Ut(e),petState:e.petState,")) {
      source = replaceExact(
        source,
        "title:Ut(e),turnKey:e.turnKey,updatedAtMs:e.updatedAtMs,waitingRequest:e.status===`waiting`?e.waitingRequest:null}",
        "title:Ut(e),petState:e.petState,turnKey:e.turnKey,updatedAtMs:e.updatedAtMs,waitingRequest:e.status===`waiting`?e.waitingRequest:null}",
      );
    }

    source = replaceExact(
      source,
      "let n=ye(e);t.samples=xe([...t.samples,n]);let r=n.screenX-t.screenX,i=n.screenY-t.screenY;Math.abs(r)<Yt&&Math.abs(i)<Yt||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,x(e=>_n({currentDragState:e,deltaX:r})),S.dispatchMessage(`avatar-overlay-drag-move`,{}))",
      "let n=ye(e);t.samples=xe([...t.samples,n]);let r=n.screenX-t.screenX,i=n.screenY-t.screenY;Math.abs(r)<Yt&&Math.abs(i)<Yt||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,x(e=>_n({currentDragState:e,deltaX:r,deltaY:i,events:h.animationConfig?.events})),S.dispatchMessage(`avatar-overlay-drag-move`,{}))",
    );

    source = replaceExact(
      source,
      "function _n({currentDragState:e,deltaX:t}){return t>=Yt?`running-right`:t<=-Yt?`running-left`:e}",
      "function _n({currentDragState:e,deltaX:t,deltaY:n,events:r}){return t>=Yt?r?.dragRight??`running-right`:t<=-Yt?r?.dragLeft??`running-left`:n<=-Yt?r?.dragUp??`waving`:n>=Yt?r?.dragDown??`jumping`:e}",
    );

    return writeIfChanged(file, source);
  }

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
    "if(e.isLoading)return{badgeBackgroundColor:`var(--color-token-activity-bar-badge-background)`,badgeForegroundColor:`var(--color-token-activity-bar-badge-foreground)`,fallbackBodyMessage:q.runningFallbackBody,iconClassName:`icon-xs shrink-0 text-token-text-secondary`,iconType:`spinner`,labelMessage:q.running,mascotState:`running`};",
    "if(e.isLoading)return{badgeBackgroundColor:`var(--color-token-activity-bar-badge-background)`,badgeForegroundColor:`var(--color-token-activity-bar-badge-foreground)`,fallbackBodyMessage:q.runningFallbackBody,iconClassName:`icon-xs shrink-0 text-token-text-secondary`,iconType:`spinner`,labelMessage:q.running,mascotState:e.petState??`running`};",
  );

  source = replaceExact(
    source,
    "case`warning`:return{badgeBackgroundColor:`var(--color-token-editor-warning-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:q.waiting,iconClassName:`icon-xs shrink-0 text-token-editor-warning-foreground`,iconType:`clock`,labelMessage:q.waiting,mascotState:`waiting`};",
    "case`warning`:return{badgeBackgroundColor:`var(--color-token-editor-warning-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:q.waiting,iconClassName:`icon-xs shrink-0 text-token-editor-warning-foreground`,iconType:`clock`,labelMessage:q.waiting,mascotState:e.petState??`waiting`};",
  );

  source = replaceExact(
    source,
    "case`danger`:return{badgeBackgroundColor:`var(--color-token-error-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:q.failed,iconClassName:`icon-xs shrink-0 text-token-error-foreground`,iconType:`warning`,labelMessage:q.failed,mascotState:`failed`};",
    "case`danger`:return{badgeBackgroundColor:`var(--color-token-error-foreground)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:q.failed,iconClassName:`icon-xs shrink-0 text-token-error-foreground`,iconType:`warning`,labelMessage:q.failed,mascotState:e.petState??`failed`};",
  );

  source = replaceExact(
    source,
    "case`success`:return{badgeBackgroundColor:`var(--color-token-charts-green)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:q.review,iconClassName:`icon-xs shrink-0 text-token-charts-green`,iconType:`check-circle`,labelMessage:q.review,mascotState:`review`};",
    "case`success`:return{badgeBackgroundColor:`var(--color-token-charts-green)`,badgeForegroundColor:`var(--color-token-bg-primary)`,fallbackBodyMessage:q.review,iconClassName:`icon-xs shrink-0 text-token-charts-green`,iconType:`check-circle`,labelMessage:q.review,mascotState:e.petState??`review`};",
  );

  source = replaceExact(
    source,
    "return{actionPath:`/local/`+e.id,hostId:n,key:r+`:`+n+`:`+e.id,localConversationId:e.id,source:r,status:ue(e),subtitle:ce(e,t),title:s(e)??t.formatMessage(Y.newThread),turnKey:String(e.turns.length),updatedAtMs:e.updatedAt}}",
    "return{actionPath:`/local/`+e.id,hostId:n,key:r+`:`+n+`:`+e.id,localConversationId:e.id,petState:rrPet(e.turns.at(-1)?.items??[]),source:r,status:ue(e),subtitle:ce(e,t),title:s(e)??t.formatMessage(Y.newThread),turnKey:String(e.turns.length),updatedAtMs:e.updatedAt}}",
  );

  source = replaceExact(
    source,
    "return{actionPath:`/remote/`+e.id,hostId:null,key:`cloud:`+e.id,localConversationId:null,source:`cloud`,status:de(e),subtitle:null,title:e.title?.trim()||t.formatMessage(Y.newThread),turnKey:e.task_status_display?.latest_turn_status_display?.turn_id??null,updatedAtMs:n}}",
    "return{actionPath:`/remote/`+e.id,hostId:null,key:`cloud:`+e.id,localConversationId:null,petState:null,source:`cloud`,status:de(e),subtitle:null,title:e.title?.trim()||t.formatMessage(Y.newThread),turnKey:e.task_status_display?.latest_turn_status_display?.turn_id??null,updatedAtMs:n}}",
  );

  source = replaceExact(
    source,
    "if(e.type===`webSearch`){let n=Z(e.query);return n==null?t.formatMessage(Y.searchedWeb):t.formatMessage(Y.searchedQuery,{query:n})}return null}function Z(e){",
    "if(e.type===`webSearch`){let n=Z(e.query);return n==null?t.formatMessage(Y.searchedWeb):t.formatMessage(Y.searchedQuery,{query:n})}return null}function rrPet(e){for(let t=e.length-1;t>=0;--t){let n=e[t];if(n?.type===`commandExecution`){let e=n.commandActions?.at?.(-1),t=n.status===`inProgress`;if(e?.type===`read`)return t?`reading`:`read`;if(e?.type===`listFiles`)return t?`listing`:`listed`;if(e?.type===`search`)return t?`searching`:`searched`;return t?`running-command`:`ran-command`}if(n?.type===`fileChange`)return n.status===`inProgress`?`editing`:`edited`;if(n?.type===`mcpToolCall`)return n.status===`inProgress`?`calling-tool`:`called-tool`;if(n?.type===`webSearch`)return n.status===`inProgress`?`searching-web`:`searched-web`;if(n?.type===`reasoning`)return`thinking`}return null}function Z(e){",
  );

  source = replaceExact(
    source,
    "source:e.source,title:e.title,turnKey:e.turnKey,updatedAtMs:e.updatedAtMs}",
    "petState:e.petState,source:e.source,title:e.title,turnKey:e.turnKey,updatedAtMs:e.updatedAtMs}",
  );

  source = replaceOneExact(
    source,
    [
      "let n=V(e);t.samples=U([...t.samples,n]);let r=n.screenX-t.screenX,i=n.screenY-t.screenY;Math.abs(r)<Ge&&Math.abs(i)<Ge||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,s(e=>ut({currentDragState:e,deltaX:r})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
      "let n=V(e);t.samples=U([...t.samples,n]);let r=n.screenX-t.screenX,i=n.screenY-t.screenY;Math.abs(r)<Ge&&Math.abs(i)<Ge||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,s(e=>ut({currentDragState:e,deltaX:r,deltaY:i})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
      "let n=V(e);t.samples=U([...t.samples,n]);let r=n.screenX-t.screenX,i=n.screenY-t.screenY;Math.abs(r)<Ge&&Math.abs(i)<Ge||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,s(e=>ut({currentDragState:e,deltaX:r,deltaY:i,events:null})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
    ],
    "let n=V(e);t.samples=U([...t.samples,n]);let dragDx=n.screenX-t.screenX,dragDy=n.screenY-t.screenY;Math.abs(dragDx)<Ge&&Math.abs(dragDy)<Ge||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,s(e=>ut({currentDragState:e,deltaX:dragDx,deltaY:dragDy,events:r.animationConfig?.events})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))",
  );

  source = replaceOneExact(
    source,
    [
      "function ut({currentDragState:e,deltaX:t}){return t>=Ge?`running-right`:t<=-Ge?`running-left`:e}",
      "function ut({currentDragState:e,deltaX:t,deltaY:n}){return t>=Ge?`running-right`:t<=-Ge?`running-left`:n<=-Ge?`waving`:n>=Ge?`jumping`:e}",
    ],
    "function ut({currentDragState:e,deltaX:t,deltaY:n,events:r}){return t>=Ge?r?.dragRight??`running-right`:t<=-Ge?r?.dragLeft??`running-left`:n<=-Ge?r?.dragUp??`waving`:n>=Ge?r?.dragDown??`jumping`:e}",
  );

  return writeIfChanged(file, source);
}

function patchMascotButton(file) {
  let source = read(file);

  const destructured =
    "{ariaLabel:n,assetRef:i,animationConfig:q,className:d,notificationBadge:f,onContextMenu:p,resizeHandle:m,spritesheetUrl:h,state:g,style:_,transientState:v}=e,y=g===void 0?`idle`:g";
  if (!source.includes(destructured)) {
    source = replaceExact(
      source,
      "{ariaLabel:n,assetRef:i,className:d,notificationBadge:f,onContextMenu:p,resizeHandle:m,spritesheetUrl:h,state:g,style:_,transientState:v}=e,y=g===void 0?`idle`:g",
      destructured,
    );
  }

  if (!source.includes("C=v??(b?(q?.events?.hover??`jumping`):y)")) {
    source = replaceExact(
      source,
      "C=v??(b?`jumping`:y)",
      "C=v??(b?(q?.events?.hover??`jumping`):y)",
    );
  }

  if (!source.includes("let j=(0,u.jsx)(s,{assetRef:i,animationConfig:q,")) {
    source = replaceBetween(
      source,
      "let j;",
      "let M;",
      "let j=(0,u.jsx)(s,{assetRef:i,animationConfig:q,className:`relative z-10`,spritesheetUrl:h,state:C});",
    );
  }

  source = source.replace(
    "let j=(0,u.jsx)(s,{assetRef:i,animationConfig:q,className:`relative z-10`,spritesheetUrl:h,state:C});let M;let M;",
    "let j=(0,u.jsx)(s,{assetRef:i,animationConfig:q,className:`relative z-10`,spritesheetUrl:h,state:C});let M;",
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

function canWriteFile(file) {
  if (!fs.existsSync(file)) {
    return true;
  }
  let fd = null;
  try {
    fd = fs.openSync(file, "r+");
    return true;
  } catch {
    return false;
  } finally {
    if (fd != null) {
      fs.closeSync(fd);
    }
  }
}

function assertCanUpdateExecutableIntegrity(exeFile) {
  if (!canWriteFile(exeFile)) {
    throw new Error(
      `Unable to update ${exeFile}. Close the copied Codex app and rerun this script.`,
    );
  }
}

function patchExecutableAsarIntegrity(exeFile, nextHash) {
  if (!fs.existsSync(exeFile)) {
    console.warn(`Skipping executable integrity update; missing ${exeFile}`);
    return false;
  }

  const exe = fs.readFileSync(exeFile);
  const source = exe.toString("latin1");
  const marker = '"file":"resources\\\\app.asar","alg":"SHA256","value":"';
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
ensureAdvancedPetSystemBuild();
const advancedPetSystem = require(advancedPetSystemBuildPath);

if (!fs.existsSync(extractedDir)) {
  run("asar", ["extract", `"${asarPath}"`, `"${extractedDir}"`]);
}

assertExists(extractedDir);
const workspaceFile = findChunk(
  workspaceBuildDir,
  "workspace custom pet loader",
  (source) =>
    source.includes("sourceMappingURL=workspace-root-drop-handler-") &&
    source.includes("spritesheetDataUrl:") &&
    (source.includes("safeParse(JSON.parse(await") ||
      source.includes("animationConfig:p.animation??p.sequences??null")),
);
const avatarFile = findChunk(
  webviewAssetsDir,
  "pet renderer",
  (source) =>
    source.includes("codex-avatar-root") &&
    source.includes("data-testid") &&
    source.includes("codex-avatar") &&
    source.includes("data-avatar-state"),
);
const overlayFile = findChunk(
  webviewAssetsDir,
  "pet overlay",
  (source) =>
    source.includes("AvatarOverlayPage") &&
    source.includes("data-avatar-mascot") &&
    source.includes("avatar-overlay-drag-move"),
);
const mascotButtonFile = findOptionalChunk(
  webviewAssetsDir,
  "pet mascot button",
  (source) =>
    source.includes("codex-avatar-button") &&
    source.includes("data-avatar-mascot") &&
    source.includes("transientState"),
);
assertExists(workspaceFile);
assertExists(avatarFile);
assertExists(overlayFile);

fs.mkdirSync(chunkBackupDir, { recursive: true });
copyIfMissing(asarPath, backupAsarPath);
copyIfMissing(
  workspaceFile,
  path.join(chunkBackupDir, `${path.basename(workspaceFile)}.backup-before-pet-patch`),
);
copyIfMissing(
  avatarFile,
  path.join(chunkBackupDir, `${path.basename(avatarFile)}.backup-before-pet-patch`),
);
copyIfMissing(
  overlayFile,
  path.join(chunkBackupDir, `${path.basename(overlayFile)}.backup-before-pet-patch`),
);
if (mascotButtonFile != null) {
  copyIfMissing(
    mascotButtonFile,
    path.join(chunkBackupDir, `${path.basename(mascotButtonFile)}.backup-before-pet-patch`),
  );
}

const changed =
  patchWorkspaceLoader(workspaceFile) |
  patchCodexAvatar(avatarFile) |
  patchOverlay(overlayFile) |
  (mascotButtonFile == null ? false : patchMascotButton(mascotButtonFile));

if (fs.existsSync(codexExePath)) {
  assertCanUpdateExecutableIntegrity(codexExePath);
}

run("asar", ["pack", extractedDir, asarPath]);

const integrityChanged = patchExecutableAsarIntegrity(
  codexExePath,
  getAsarHeaderHash(asarPath),
);

console.log(
  changed || integrityChanged
    ? `Patched and repacked copied Codex app with Advanced Pet System (${advancedPetSystem.ACTIVITY_STATE_NAMES.length} activity states).`
    : `Advanced Pet System was already present; repacked copied Codex app (${advancedPetSystem.ACTIVITY_STATE_NAMES.length} activity states).`,
);
