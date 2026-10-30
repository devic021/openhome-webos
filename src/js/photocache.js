//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// A local pool of wallpapers on the TV's own disk, kept fresh in the background.
//
// Why: streaming a picture every time costs about 78 MB an hour and makes the swap wait on the
// network. Keeping them on disk makes every swap instant and works with the internet down. But a
// pool that never changes gets stale, so a slow trickle replaces the oldest picture with a new one
// pulled straight from Wikimedia Commons - the TV does the querying and downloading itself with
// curl through the root service, so there is no CORS problem and nothing to pre-package.
//
// How fast that trickle runs is the t("Photo refresh") setting: off (0 MB/h, the same pictures
// for ever), daily (the whole pool turns over once a day, ~7 MB/h) or cycle (a new picture for
// every picture shown, ~78 MB/h - always new, but no cheaper than streaming).
//
// Pictures of your own live in the same folder, and the t("Which photos") setting says whether
// the rotation uses them, the downloads, or both.

const WALLDIR="/media/developer/wallpapers";
const POOL_TARGET=200;            // pictures to keep on disk (~1.9 MB each); they live on the USB disk
const POOL_MIN=8;                 // enough to start showing from disk instead of the network
const FILL_MS=20*1000;            // while first filling up, fetch this often
const PHOTOS_PER_DAY=60;          // "daily" replaces this many a day whatever the pool size,
                                  // so a bigger pool means more variety at the SAME bandwidth
const MIN_BYTES=120*1024;         // anything smaller than this did not really download

const WALL_CATEGORIES=[
	"Featured pictures of mountains","Featured pictures of lakes","Featured pictures of coasts",
	"Featured pictures of national parks","Featured pictures of cityscapes",
	"Featured pictures of skylines","Featured pictures of waterfalls"
];

let pool=[];                      // [{f:"w1760...jpg", n:"name"}], oldest first
let mine=[];                      // file names of pictures the user put there themselves
let poolbusy=false;
let pooltimer=null;

// ---- pictures of your own ---------------------------------------------------
// The folder below is where scripts/wallpapers.sh mounts a USB disk, so the obvious thing to do
// with it is to copy your own photographs on. Until now that did nothing at all: the playlist was
// built from list.json, the manifest this file keeps for its OWN downloads, so anything else on
// the disk was invisible while the trickle went on fetching more on top of it.
//
// So: everything in the folder that looks like a picture and is not named by the manifest is one
// of yours. Matching the manifest rather than our w<timestamp>.jpg shape is deliberate - a
// download the manifest has forgotten is a file nobody owns, and treating it as yours is better
// than leaving it on the disk unused for ever.
const MINE_EXT=/\.(jpe?g|png|webp)$/i;

async function minescan(){
	let names=[];
	try {
		const r=await wallsh("ls -1 "+shellquote(WALLDIR)+" 2>/dev/null");
		names=String((r && r.stdoutString) || "").split("\n").map((line) => line.trim());
	} catch(e) { names=[]; }
	const ours={};
	pool.forEach((each) => { ours[each.f]=true; });
	// a leading dot covers both hidden files and the ._name forks a Mac leaves on a USB stick
	mine=names.filter((name) => name && name.charAt(0)!=="." && MINE_EXT.test(name) && !ours[name]).sort();
}

// A rescan, for pictures copied on while the launcher was running.
async function minerescan(){
	await minescan();
	if(typeof photocacheready==="function"){ photocacheready(); }
	if(typeof settingsisopen==="function" && settingsisopen() && typeof renderpane==="function"){ renderpane(); }
}

// The name may contain anything a filesystem allows, and the entry's url ends up both in an
// img.src and inside a CSS url("..."), so it is encoded rather than pasted in.
function mineentries(){
	return mine.map((name) => ({
		n:name.replace(MINE_EXT,"").replace(/_+/g," ").slice(0,52),
		s:t("Yours"),
		u:"hack"+WALLDIR+"/"+encodeURIComponent(name)
	}));
}

// t("Which photos"): yours, the downloads, or both
function photomix(){
	const how=prefs.photoMix;
	return (how==="mine" || how==="commons")?how:"both";
}

// photowall.js asks, so that "only mine" with an empty folder falls back to the bundled wallpaper
// instead of quietly streaming from Commons, which is the one thing that choice rules out.
function poolmineonly(){
	return photomix()==="mine";
}

function poolentries(){
	// what photowall.js plays: local paths through the app's root symlink
	const how=photomix();
	const yours=(how==="commons")?[]:mineentries();
	const ours=(how==="mine")?[]:pool.map((each) => ({n:each.n,s:"Commons",u:"hack"+WALLDIR+"/"+each.f}));
	return yours.concat(ours);
}

function poolready(){
	const how=photomix();
	// one picture of your own is enough to start; the downloads wait until there is some variety
	if(how!=="commons" && mine.length>0){ return true; }
	return how!=="mine" && pool.length>=POOL_MIN;
}

function wallsh(command){
	return execasroot(command);
}

async function poolload(){
	try {
		const r=await wallsh("cat "+shellquote(WALLDIR+"/list.json")+" 2>/dev/null");
		const saved=JSON.parse(String((r && r.stdoutString) || "[]"));
		if(Array.isArray(saved)){ pool=saved.filter((each) => each && typeof each.f==="string"); }
	} catch(e) { pool=[]; }
}

async function poolsave(){
	try {
		await wallsh("mkdir -p "+shellquote(WALLDIR)+"; printf '%s' "+shellquote(JSON.stringify(pool))+" > "+shellquote(WALLDIR+"/list.json"));
	} catch(e) {}
}

// one fresh candidate from Commons: a random slice of a random scenic category
async function wallcandidate(){
	const category=WALL_CATEGORIES[Math.floor(Math.random()*WALL_CATEGORIES.length)];
	const offset=Math.floor(Math.random()*300);
	const query="https://commons.wikimedia.org/w/api.php?action=query&generator=search"+
		"&gsrsearch="+encodeURIComponent('deepcategory:"'+category+'" filetype:bitmap')+
		"&gsrnamespace=6&gsrlimit=12&gsroffset="+offset+
		"&prop=imageinfo&iiprop=url%7Csize&iiurlwidth=3840&format=json&formatversion=2";
	let answer;
	try {
		const r=await wallsh("curl -s -m 25 -A 'OpenLauncher-wallpaper/1.0' "+shellquote(query));
		answer=JSON.parse(String((r && r.stdoutString) || "{}"));
	} catch(e) { return null; }
	const pages=(answer.query && answer.query.pages) || [];
	const have={};
	pool.forEach((each) => { have[each.n]=true; });
	const usable=pages.filter((page) => {
		const info=(page.imageinfo || [{}])[0];
		const url=String(info.thumburl || "").split("?")[0];
		if(url.indexOf("/thumb/")===-1 || !/\.jpe?g$/i.test(url)){ return false; }
		if((info.width || 0)<3840 || (info.thumbwidth || 0)<3840){ return false; }       // real 4K, not an upscale
		if(!info.thumbheight || info.thumbwidth/info.thumbheight<1.55){ return false; }  // wide, like the screen
		return !have[page.title.replace("File:","").replace(/\.[^.]+$/,"")];
	});
	if(usable.length===0){ return null; }
	const picked=usable[Math.floor(Math.random()*usable.length)];
	return {
		u:String(picked.imageinfo[0].thumburl).split("?")[0],
		n:picked.title.replace("File:","").replace(/\.[^.]+$/,"").replace(/_+/g," ").slice(0,52)
	};
}

// fetch one picture and, once it is safely on disk, drop the oldest one if the pool is full
async function poolgrow(){
	if(poolbusy){ return; }
	poolbusy=true;
	try {
		const candidate=await wallcandidate();
		if(!candidate){ return; }
		const name="w"+Date.now()+".jpg";
		const temp=WALLDIR+"/.part";
		const result=await wallsh(
			"mkdir -p "+shellquote(WALLDIR)+" && "+
			"curl -s -m 150 -A 'OpenLauncher-wallpaper/1.0' -o "+shellquote(temp)+" "+shellquote(candidate.u)+" && "+
			"mv "+shellquote(temp)+" "+shellquote(WALLDIR+"/"+name)+" && wc -c < "+shellquote(WALLDIR+"/"+name));
		const size=parseInt(String((result && result.stdoutString) || "0").trim(),10);
		if(!(size>MIN_BYTES)){
			await wallsh("rm -f "+shellquote(temp)+" "+shellquote(WALLDIR+"/"+name));
			return;
		}
		pool.push({f:name,n:candidate.n});
		while(pool.length>POOL_TARGET){
			const gone=pool.shift();
			await wallsh("rm -f "+shellquote(WALLDIR+"/"+gone.f));
		}
		await poolsave();
	} catch(e) {
	} finally {
		poolbusy=false;
	}
}

// ---- t("Fetch new photos"): swap the whole pool now, with progress in Settings
let poolrenewleft=0;
let poolstatus="";

function poolbusytext(){
	if(poolrenewleft>0){ return poolstatus; }
	const yours=mine.length?t("Yours: ")+mine.length+t(" in the folder."):"";
	if(photomix()==="mine"){
		return yours || t("No pictures of your own in the wallpaper folder yet.");
	}
	const ours=pool.length?(t("On the TV: ")+pool.length+t(" of ")+POOL_TARGET+t(" pictures.")):
		t("The pool is still empty - filling in the background.");
	return [yours,ours,poolstatus].filter(Boolean).join(" ");
}

async function poolrenew(){
	if(poolrenewleft>0){ return; }          // already running
	poolrenewleft=POOL_TARGET;
	poolstatus=t("Downloading...");
	const tick=() => { if(typeof settingsisopen==="function" && settingsisopen()){ renderpane(); } };
	tick();
	let done=0;
	while(poolrenewleft>0){
		const before=pool.length?pool[pool.length-1].f:null;
		await poolgrow();
		const after=pool.length?pool[pool.length-1].f:null;
		if(after!==before){ done++; }
		poolrenewleft--;
		poolstatus=t("Downloaded ")+done+t(" of ")+POOL_TARGET+"...";
		tick();
		await new Promise((go) => setTimeout(go,400));
	}
	poolstatus=t("Done - the new pictures are on the TV.");
	if(typeof photoqueue!=="undefined"){ photoqueue=[]; }    // start showing them straight away
	tick();
	poolschedule();
}

// how long between replacements, from the setting
function poolinterval(){
	if(photomix()==="mine"){ return 0; }      // nothing to fetch: the rotation is your own files
	const how=prefs.photoRefresh || "daily";
	if(how==="off"){ return 0; }
	if(pool.length<POOL_TARGET){ return FILL_MS; }                 // still filling up
	if(how==="cycle"){ return (Number(prefs.customSeconds)||120)*1000; }
	return Math.round(24*60*60*1000/PHOTOS_PER_DAY);               // daily: a fixed number a day, not the whole pool
}

function poolschedule(){
	clearTimeout(pooltimer);
	const wait=poolinterval();
	if(wait<=0){ return; }
	pooltimer=setTimeout(async () => {
		if(!document.hidden && prefs.videoSource==="photos"){ await poolgrow(); }
		poolschedule();
	},wait);
}

async function initphotocache(){
	if(typeof rooted==="undefined" || !rooted || typeof execasroot!=="function"){ return; }
	await poolload();
	// drop anything the manifest lists that is not actually on disk any more
	if(pool.length){
		try {
			const r=await wallsh("ls "+shellquote(WALLDIR)+" 2>/dev/null");
			const there={};
			String((r && r.stdoutString) || "").split("\n").forEach((line) => { there[line.trim()]=true; });
			const kept=pool.filter((each) => there[each.f]);
			if(kept.length!==pool.length){
				pool=kept;
				await poolsave();
			}
		} catch(e) {}
	}
	await minescan();
	if(typeof photocacheready==="function"){ photocacheready(); }
	poolschedule();
}

document.addEventListener("DOMContentLoaded",() => { setTimeout(initphotocache,4000); });
