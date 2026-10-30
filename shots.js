#!/usr/bin/env node
// Photograph every screen of the launcher, straight off the TV.
//
// One DevTools connection drives the whole set: each screen is opened by calling the launcher's
// own functions, given a moment to settle, then captured at deviceScaleFactor 2 - the page is laid
// out at 1920x1080 but the panel is 4K, so this is a real 3840x2160 picture.
//
// Every capture also dumps the text that is actually painted on it. A string can be built by
// concatenation and never appear as a literal in the source, so reading the live page is the only
// way to be sure what a screen really says.
//
//   node shots.js [names...]       only those screens; default is all twenty

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const TV = process.env.TV || "192.168.1.239";
const PORT = process.env.PORT || 9998;
const args = process.argv.slice(2);
// the repository was called repo-draft before it was published; this path outlived the
// rename and quietly wrote a whole set of captures into a folder nobody reads
const OUT = path.join(__dirname, "docs/screenshots");
const ONLY = args.length ? new Set(args) : null;

// Everything is closed first, so a screen never inherits the one before it.
const SHUT = `closesettings();closeforecast();closesys();closeappmenu();closeinfo();closefolderpicker();closerename();if(editing){toggleedit();}if(realappbarbtu.checked){realappbarbtu.click();}`;
const SETTINGS = (tab) => `${SHUT};opensettings();settingstab=${JSON.stringify(tab)};renderpane();`;
const TVTAB = (group) => `${SETTINGS("tv")}tvsgroup=${JSON.stringify(group)};renderpane();`;

const SCREENS = [
	["home", SHUT, 1200],
	["home-clean", `${SHUT};skipvideo();`, 2600],
	["forecast", `${SHUT};openforecast();`, 1400],
	["system", `${SHUT};opensys();`, 2600],
	["apps", `${SHUT};realappbarbtu.click();`, 1600],
	["settings-clock", SETTINGS("clock"), 1200],
	// the wallpaper pane reads the disk, so it needs longer than the others to settle
	["settings-wallpaper", SETTINGS("wallpaper"), 2600],
	["tv-privacy", TVTAB("privacy"), 1600],
	["tv-screen", TVTAB("screen"), 1600],
	["tv-picture", TVTAB("picture"), 1600],
	["tv-picture-plus", TVTAB("pictureplus"), 1600],
	["tv-accessibility", TVTAB("accessibility"), 1600],
	["tv-sound", TVTAB("sound"), 1600],
	["tv-hdmi", TVTAB("hdmi"), 1600],
	["tv-power", TVTAB("poweroff"), 1600],
	["tv-network", TVTAB("network"), 2200],
	["tv-wifi", TVTAB("wifi"), 3000],
	["tv-bluetooth", TVTAB("bluetooth"), 3000],
	["tv-devices", TVTAB("devices"), 2200],
	["tv-system", TVTAB("system"), 1600],
];

const TEXT_DUMP = `(() => {
	const out = [];
	const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	for (let node = walk.nextNode(); node; node = walk.nextNode()) {
		const text = node.textContent.replace(/\\s+/g, " ").trim();
		if (!text) continue;
		const el = node.parentElement;
		if (!el) continue;
		const style = getComputedStyle(el);
		if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
		const box = el.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) continue;
		if (box.bottom < 0 || box.top > innerHeight) continue;
		out.push(text);
	}
	// Generated content is painted but is not a text node, so it has to be asked for separately.
	// A CSS content: string is exactly how the drawer's title hid from an earlier sweep.
	document.querySelectorAll("*").forEach((e) => {
		["::before", "::after"].forEach((part) => {
			const c = getComputedStyle(e, part).content;
			if (!c || c === "none" || c === "normal") return;
			const m = /^"(.*)"$/.exec(c);
			if (m && m[1].trim()) out.push(m[1]);
		});
	});
	document.querySelectorAll("[placeholder]").forEach((e) => { if (e.offsetParent) out.push(e.getAttribute("placeholder")); });
	return out.join("\\n");
})()`;

function connect(url) {
	return new Promise((ok, no) => {
		const ws = new WebSocket(url);
		let id = 0;
		const waiting = new Map();
		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.id && waiting.has(message.id)) {
				const { resolve, reject } = waiting.get(message.id);
				waiting.delete(message.id);
				message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
			}
		};
		ws.onerror = () => no(new Error("cannot reach the TV's debug port"));
		ws.onopen = () => ok({
			send(method, params = {}) {
				const mine = ++id;
				return new Promise((resolve, reject) => {
					waiting.set(mine, { resolve, reject });
					ws.send(JSON.stringify({ id: mine, method, params }));
				});
			},
			close: () => ws.close(),
		});
	});
}

// webOS preloads other apps at boot - Netflix, YouTube and friends - and they are debuggable
// too, so "the first page in the list" is whichever one happens to be first. Pick ours by name.
const APP_ID = process.env.APP_ID || "io.github.devic021.openhome";
function pickpage(list) {
	const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
	const ours = pages.filter((t) => (t.url || "").indexOf(APP_ID) !== -1);
	if (ours.length) return ours[0];
	if (!pages.length) throw new Error("no debuggable page on the TV");
	throw new Error("the launcher is not among the " + pages.length + " debuggable pages: " +
		pages.map((t) => t.title || t.url).join(", "));
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms));

async function main() {
	const list = await (await fetch(`http://${TV}:${PORT}/json/list`)).json();
	const page = pickpage(list);
	const cdp = await connect(page.webSocketDebuggerUrl);
	fs.mkdirSync(OUT, { recursive: true });

	const evaluate = async (expression) => {
		const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "threw");
		return r.result.value;
	};

	await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
	const texts = {};
	for (const [name, setup, settle] of SCREENS) {
		if (ONLY && !ONLY.has(name)) continue;
		await evaluate(setup);
		await wait(settle);
		const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
		const png = path.join(OUT, name + ".png");
		const jpg = path.join(OUT, name + ".jpg");
		fs.writeFileSync(png, Buffer.from(shot.data, "base64"));
		// sips ships with macOS, so the JPEG conversion needs nothing installed
		execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", png, "--out", jpg], { stdio: "ignore" });
		fs.unlinkSync(png);
		texts[name] = await evaluate(TEXT_DUMP);
		console.log(`  ${name}.jpg  ${(fs.statSync(jpg).size / 1024 / 1024).toFixed(1)} MB`);
	}
	await evaluate(SHUT);
	await cdp.send("Emulation.clearDeviceMetricsOverride");
	cdp.close();
	fs.writeFileSync(path.join(OUT, ONLY ? ".onscreen-text-part.txt" : ".onscreen-text.txt"),
		Object.entries(texts).map(([k, v]) => `===== ${k} =====\n${v}`).join("\n\n"));
	console.log(`\n${Object.keys(texts).length} screens -> ${OUT}`);
}

main().catch((e) => { console.error(String(e.message || e)); process.exitCode = 1; });
