//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// One-press shortcuts just above the dock: the TV's inputs that actually have something plugged
// into them. The names come from the launcher (so a renamed input keeps your name), while the
// artwork comes from the TV's own input assets, which already carry a per-device picture - a
// console that announces itself over CEC as a PlayStation gets LG's PlayStation glyph instead of
// the generic "game console" one.

const QUICK_MATCH=/^com\.webos\.app\.(hdmi\d+|livetv)$/;
const QUICK_MAX=6;
const QUICK_POLL_MS=12*1000;   // the input manager does not push, so this is how fast a newly
                               // plugged-in device shows up while the launcher is on screen
const QUICK_GIVEUP=3;          // failed reads before falling back to showing every input
let quickrow=null;
let quickdevices=null;         // appId -> the TV's input record, once it has answered
let quick5v={};                // port number -> is the 5V line live on it
let quickfails=0;
let quickshown={};             // appIds drawn by the previous render, so new ones can fade in
let quickdrawn=false;

// which inputs have a device on them, from the TV's own input manager
// the 5V line per port, for the devices that do not speak CEC. Answers as {"HDMI1":{"5v":"TRUE"},...}
// whatever port you ask about, so it is asked once. (LG's own typo "FASLE" appears in there, which
// is why this tests for TRUE rather than against FALSE.)
async function read5v(){
	try {
		const answer=await lunacall('luna://com.webos.service.eim/getHDMISignalInfo',{});
		const found={};
		Object.keys(answer || {}).forEach((key) => {
			const port=/^HDMI(\d+)$/.exec(key);
			if(port && answer[key]){ found[Number(port[1])]=String(answer[key]["5v"]).toUpperCase()==="TRUE"; }
		});
		quick5v=found;
	} catch(e) {}
}

async function readinputs(){
	try {
		const answer=await lunacall('luna://com.webos.service.eim/getAllInputStatus',{});
		if(answer && Array.isArray(answer.devices)){
			quickdevices={};
			quickfails=0;
			answer.devices.forEach((each) => { if(each && each.appId){ quickdevices[each.appId]=each; } });
			await read5v();
			renderquick();
			return;
		}
		throw new Error("no devices");
	} catch(e) {
		// if the input manager never answers, an empty row would be worse than an honest one
		if(++quickfails>=QUICK_GIVEUP && quickdevices===null){
			quickdevices={};
			renderquick();
		}
	}
}

function quickapps(){
	if(typeof applist==="undefined" || !applist){ return []; }
	// Empty inputs are not listed at all any more - they appear by themselves the moment something
	// is plugged into them. The filter runs BEFORE the cap, so six live inputs can all fit.
	return applist
		.filter((each) => QUICK_MATCH.test(each.id) && !ishidden(each.id) && quicklive(each))
		.slice(0,QUICK_MAX);
}

// is there anything on this input at all? (cable present / device detected - it may well be off)
function quicklive(app){
	if(app.id==="com.webos.app.livetv"){ return true; }           // no plug to check
	if(quickdevices===null){ return false; }                      // nothing drawn until the TV answers
	const device=quickdevices[app.id];
	if(!device){ return quickfails>=QUICK_GIVEUP; }               // unknown: only in the fallback
	return device.connected===true;
}

// ...and is it awake right now?
//
// NOT hdmiSignalExist: that is only ever true for the input the TV is actually tuned to, so on the
// home screen it is false for everything and the pip would never light. Two things do work from
// here, and between them they cover both boxes on this TV:
//
//   cecPower   devices that speak CEC report their power state in subList even while the TV is on
//              another input. The PS5 shows {"id":"SIMPLINK","cecPower":"On","osdName":"PlayStation5"}.
//   5V         a device with no CEC still powers the HDMI 5V line when it is on. That is how the
//              PC on HDMI1 can be told apart from a dark one.
//
// CEC first where it exists, because a PS5 in rest mode keeps 5V up and would otherwise read as awake.
function quicksignal(app){
	const device=quickdevices && quickdevices[app.id];
	if(!device){ return false; }
	const cec=(device.subList || []).filter((each) => each && typeof each.cecPower==="string")[0];
	if(cec){ return cec.cecPower==="On"; }
	return quick5v[device.port]===true;
}

// best picture first; the <img>'s error handler walks down the list
function inputicons(app){
	const out=[];
	const device=quickdevices && quickdevices[app.id];
	if(device && device.icon && device.iconPrefix){
		let icon=device.icon;
		if(/playstation|\bps\s?\d\b/i.test(String(device.label||""))){ icon="ps3.png"; }
		// the same art in bigger sets; this panel draws at devicePixelRatio 2, so the 60px
		// "small" version would be soft
		out.push("hack"+device.iconPrefix.replace("/assets/small/","/assets/2k/medium/")+icon);
		out.push("hack"+device.iconPrefix.replace("/assets/small/","/assets/medium/")+icon);
		out.push("hack"+device.iconPrefix.replace("/assets/small/","/assets/2k/small/")+icon);
		out.push("hack"+device.iconPrefix+icon);
		if(icon!==device.icon){ out.push("hack"+device.iconPrefix+device.icon); }
	}
	const own=appiconsrc(app,0);
	if(own){ out.push(own); }
	out.push(appdir+"/access/fallback.png");
	return out;
}

// called from render() in main.js, so it follows renames, hiding and app installs
function renderquick(){
	if(!quickrow){
		quickrow=document.createElement("div");
		quickrow.id="quickrow";
		maindiv.appendChild(quickrow);
	}
	const apps=quickapps();
	maindiv.classList.toggle("has-quick",apps.length>0);
	quickrow.innerHTML="";
	const seen={};
	if(apps.length===0){ quickshown=seen; quickdrawn=true; return; }
	apps.forEach((each) => {
		const name=appdisplayname(each);
		const chip=document.createElement("button");
		// .qnew only on an input that was not there a moment ago, so plugging something in is a
		// small arrival rather than a jump. Never on the first draw - that would animate the lot.
		const arrived=quickdrawn && !quickshown[each.id];
		seen[each.id]=true;
		chip.className="qchip"+(quicksignal(each)?" qlive":"")+(arrived?" qnew":"");
		chip.setAttribute("data-appid",each.id);
		chip.setAttribute("title",name);
		chip.setAttribute("aria-label",name);
		// Our own glyph if we have one (js/inputicons.js): the TV's own artwork is per-device
		// but every file carries its own baked-in grey background, so a row of them never looks
		// like a set. Fall back to the TV's picture when we have nothing better.
		const glyph=(typeof inputglyph==="function")?inputglyph(each,quickdevices&&quickdevices[each.id]):null;
		if(glyph){
			chip.innerHTML=glyph;
		} else {
			const picture=document.createElement("img");
			picture.className="qicon";
			const sources=inputicons(each);
			let at=0;
			picture.src=sources[0];
			picture.addEventListener("error",function(e){
				if(++at<sources.length){ e.target.src=sources[at]; }
			});
			chip.appendChild(picture);
		}
		chip.addEventListener("click",() => launchapp(each.id));
		quickrow.appendChild(chip);
	});
	quickshown=seen;
	quickdrawn=true;
}

document.addEventListener("DOMContentLoaded",() => {
	readinputs();
	setInterval(() => { if(!document.hidden){ readinputs(); } },QUICK_POLL_MS);
	// You turn the console on with the launcher out of sight; this is what makes its shortcut be
	// there already when you come back to the home screen.
	document.addEventListener("visibilitychange",() => { if(!document.hidden){ readinputs(); } });
});
