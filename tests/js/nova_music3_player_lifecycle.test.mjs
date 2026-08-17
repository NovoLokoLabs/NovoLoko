import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_music3.js as the first argument");

let source = fs.readFileSync(frontendPath, "utf8").replace(/^import .*;\r?\n/gm, "");
const registration = source.indexOf("app.registerExtension({");
assert.ok(registration > 0, "frontend registration marker is present");
source = source.slice(0, registration);

const endAction = new Function(`${source}\nreturn musicPlayerEndAction;`)();

assert.equal(endAction({ repeat: "off", autoNext: false, index: 0, trackCount: 3 }), "stop");
assert.equal(endAction({ repeat: "off", autoNext: true, index: 0, trackCount: 3 }), "play-next");
assert.equal(endAction({ repeat: "off", autoNext: true, index: 2, trackCount: 3 }), "stop");
assert.equal(endAction({ repeat: "one", autoNext: false, index: 1, trackCount: 3 }), "repeat-one");
assert.equal(endAction({ repeat: "one", autoNext: true, index: 1, trackCount: 3 }), "repeat-one");
assert.equal(endAction({ repeat: "all", autoNext: false, index: 2, trackCount: 3 }), "play-next");
assert.equal(endAction({ repeat: "invalid", autoNext: false, index: 0, trackCount: 3 }), "stop");

assert.match(source, /novaMusicAutoNext/);
assert.match(source, /Play next automatically/);
assert.match(source, /autoplay\.onchange = persist/);
assert.match(source, /autoNext\.onchange = \(\) => \{ state\.autoNext = autoNext\.checked; persist\(\); \}/);
assert.doesNotMatch(source, /autoplay\.onchange[^\n]*(play|pause|currentTime)/);

