#!/usr/bin/env node
// Talk to the launcher running on the TV over the Chrome DevTools Protocol.
//
// webOS leaves a debug port open on a developer-mode app (9998), which is how the page can be
// inspected, reloaded and photographed without touching the remote. Node 22 has WebSocket built
// in, so this needs no packages.
//
//   node cdp.js eval "document.title"        run an expression in the page, print the result
//   node cdp.js reload                       reload the page
//   node cdp.js text                         every piece of visible text on screen
//   node cdp.js shot out.png [width height]  a screenshot at devicePixelRatio 2

const TV = process.env.TV || "192.168.1.239";
const PORT = process.env.PORT || 9998;

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

async function target() {
	const list = await (await fetch(`http://${TV}:${PORT}/json/list`)).json();
	return pickpage(list).webSocketDebuggerUrl;
}

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
		ws.onerror = (e) => no(new Error("websocket error: " + (e.message || "unreachable")));
		ws.onopen = () =>
			ok({
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

// an expression is evaluated with awaitPromise, so an async one can be used directly
async function evaluate(cdp, expression) {
	const result = await cdp.send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "threw");
	return result.result.value;
}

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	const cdp = await connect(await target());
	try {
		if (command === "eval") {
			const value = await evaluate(cdp, rest.join(" "));
			console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
		} else if (command === "reload") {
			await cdp.send("Page.enable");
			await cdp.send("Page.reload", { ignoreCache: true });
			console.log("reloaded");
		} else if (command === "text") {
			// Every text node that is actually painted, in document order, with the element that
			// holds it. Reading the live page is the only way to be sure what is on screen: a
			// string can be built by concatenation and never appear as a literal in the source.
			const script = `(() => {
				const out = [];
				const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				for (let node = walk.nextNode(); node; node = walk.nextNode()) {
					const text = node.textContent.replace(/\\s+/g, " ").trim();
					if (!text) continue;
					const el = node.parentElement;
					if (!el) continue;
					const style = getComputedStyle(el);
					if (style.display === "none" || style.visibility === "hidden") continue;
					const box = el.getBoundingClientRect();
					if (box.width === 0 && box.height === 0) continue;
					out.push((el.id ? "#" + el.id : el.className ? "." + String(el.className).split(" ")[0] : el.tagName.toLowerCase()) + "\\t" + text);
				}
				// placeholders and tooltips are text too, even when nothing is typed
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
	document.querySelectorAll("[placeholder]").forEach((e) => out.push("placeholder\\t" + e.getAttribute("placeholder")));
				document.querySelectorAll("[title]").forEach((e) => out.push("title\\t" + e.getAttribute("title")));
				return out.join("\\n");
			})()`;
			console.log(await evaluate(cdp, script));
		} else if (command === "shot") {
			const file = rest[0] || "shot.png";
			const width = Number(rest[1] || 1920);
			const height = Number(rest[2] || 1080);
			// The page is laid out at 1920x1080 but the panel is 4K, so the capture is asked for at
			// a device scale factor of 2 - otherwise the screenshot is half the real resolution.
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width, height, deviceScaleFactor: 2, mobile: false,
			});
			const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
			await cdp.send("Emulation.clearDeviceMetricsOverride");
			require("fs").writeFileSync(file, Buffer.from(shot.data, "base64"));
			console.log(file);
		} else {
			console.error("commands: eval <expr> | reload | text | shot <file> [w h]");
			process.exitCode = 1;
		}
	} finally {
		cdp.close();
	}
}

main().catch((e) => {
	console.error(String(e.message || e));
	process.exitCode = 1;
});
