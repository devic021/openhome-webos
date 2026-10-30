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
let poolbusy=false;
let pooltimer=null;

function poolentries(){
	// what photowall.js plays: a local path through the app's root symlink
	return pool.map((each) => ({n:each.n,s:"Commons",u:"hack"+WALLDIR+"/"+each.f}));
}

function poolready(){
	return pool.length>=POOL_MIN;
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
		const r=await wallsh("curl -s -m 25 -A 'OpenHome-wallpaper/1.0' "+shellquote(query));
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
			"curl -s -m 150 -A 'OpenHome-wallpaper/1.0' -o "+shellquote(temp)+" "+shellquote(candidate.u)+" && "+
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
	return pool.length?(t("On the TV: ")+pool.length+t(" of ")+POOL_TARGET+t(" pictures.")+(poolstatus?" "+poolstatus:"")):t("The pool is still empty - filling in the background.");
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
	if(typeof photocacheready==="function"){ photocacheready(); }
	poolschedule();
}

document.addEventListener("DOMContentLoaded",() => { setTimeout(initphotocache,4000); });
