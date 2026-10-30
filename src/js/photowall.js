//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// Photo wallpapers (js/photos.js) as a source of their own, next to the streamed videos.
//
// Why: an hour of streamed aerials is about 2.7 GB. The same hour of photographs is ~36 MB, and on
// a launcher that sits on screen all day that difference is the whole point.
//
// How it looks right: two stacked layers. The next picture is decoded into the hidden one first and
// only then cross-faded in, so a slow download never shows as a flash or a half-painted frame.
//
// It plugs into background.js by wrapping that file's own switch points (plain global function
// declarations), the same trick js/fade.js uses, so background.js itself stays untouched.

const PHOTO_FALLBACK_LIMIT=6;     // consecutive failures before handing back to the built-in loop
const PHOTO_FADE_MS=1800;         // must match the opacity transition in theme.css
let photolayers=null;
let photoactive=0;
let photoclean=null;
let photoqueue=[];
let photocurrent=null;
let photomode=false;
let phototimer=null;
let photoerrors=0;

// how long one picture stays up (t("Photo duration") in Settings)
function photoseconds(){
	const value=Number(prefs.customSeconds);
	return (isFinite(value) && value>0)?value:60;
}

function makephotolayers(){
	if(photolayers){ return; }
	photolayers=[0,1].map(() => {
		const layer=document.createElement("div");
		layer.className="bgphoto";
		// right behind everything, in the same place the video sits
		bgvideo.parentNode.insertBefore(layer,bgvideo.nextSibling);
		return layer;
	});
}

// the pictures kept on the TV's own disk if there are enough of them (js/photocache.js), and the
// bundled list of links until the pool has filled up
function photosource(){
	if(typeof poolready==="function" && poolready()){ return poolentries(); }
	// "Only mine" with an empty folder: an empty list sends startphotos() to the bundled
	// wallpaper, which is the honest answer. Falling through would stream from Commons, and
	// that is the one thing that choice rules out.
	if(typeof poolmineonly==="function" && poolmineonly()){ return []; }
	return (typeof photos!=="undefined")?photos:[];
}

// photocache.js calls this once it knows what is on disk, so the switch happens without a wait
function photocacheready(){
	if(photomode){
		photoqueue=[];
		return;
	}
	// A scan can also find the first picture while something else is on screen: at startup, where
	// the pool was still loading when the background chose a source, or after a rescan that found
	// pictures of your own. Then the rotation has to be started, not just re-queued.
	if(prefs.videoSource==="photos" && photosource().length){ startphotos(); }
}

function startphotos(){
	if(!photosource().length){
		startlocalvideo();
		return;
	}
	stopimagewallpapers();
	stopcustom();
	makephotolayers();
	photomode=true;
	bgmode="photos";
	// park the video decoder: nothing should be streaming while photographs are up
	bgvideo.pause();
	bgvideo.removeAttribute("src");
	bgvideo.load();
	bgvideo.style.display="none";
	photolayers.forEach((layer,index) => {
		layer.style.display="";
		layer.style.zIndex=String(index);
	});
	photoerrors=0;
	photoqueue=[];
	nextphoto();
}

// Evening pictures should not glare. Open-Meteo already tells us whether it is light outside, so
// that is used when the weather is on; otherwise fall back to the clock.
function photodaylight(){
	let day;
	if(typeof weatherdata!=="undefined" && weatherdata && typeof weatherdata.isday==="boolean"){
		day=weatherdata.isday;
	} else {
		const hour=new Date().getHours();
		day=(hour>=7 && hour<19);
	}
	document.body.classList.toggle("nightwall",!day);
}

function stopphotos(){
	if(!photomode){ return; }
	photomode=false;
	clearTimeout(phototimer);
	phototimer=null;
	photocurrent=null;
	if(photolayers){
		photolayers.forEach((layer) => {
			layer.classList.remove("on");
			layer.style.display="none";
		});
	}
	bgvideo.style.display="";
}

// The swap itself.
//
// The old version faded BOTH layers at once - one out, one in - and because each layer sits on
// black, the two half-transparent pictures added up to about three quarters of a picture. Every
// change pulsed darker in the middle. Measured on the TV: 0.45 / 0.55 at the midpoint, which
// composites to ~0.75 brightness.
//
// A real dissolve keeps the picture underneath at full strength and brings the new one in ON TOP
// of it, so there is always exactly one opaque picture on screen. The layers are siblings in a
// fixed DOM order, so the arriving one is raised with z-index instead of being re-inserted. The
// old layer is only switched off once the new one is fully opaque, where it cannot be seen.
//
// On top of that the arriving picture settles: it comes in 3.5% large and eases down to its true
// size over the fade. Short and bounded - no continuous animation on a 4K layer, which this TV
// would feel.
function crossfade(entry){
	const next=photolayers[(photoactive+1)%2];
	const prev=photolayers[photoactive];
	// start from a clean hidden layer even if the previous fade is still running (skip pressed twice)
	next.classList.add("instant");
	next.classList.remove("on","arriving");
	next.style.backgroundImage='url("'+entry.u+'")';
	// Only the order of these two matters, so they SWAP between 0 and 1. An ever-growing z-index
	// climbs past the interface (#statusbar is 4, #quickrow 5, #appbar 6) and the wallpaper ends
	// up painted over the whole home screen.
	next.style.zIndex="1";
	prev.style.zIndex="0";
	void next.offsetWidth;                     // commit all of that before anything animates
	next.classList.remove("instant");
	next.classList.add("on","arriving");
	prev.classList.remove("arriving");
	photoactive=(photoactive+1)%2;
	clearTimeout(photoclean);
	photoclean=setTimeout(() => {
		prev.classList.remove("on");           // invisible by now: it is behind an opaque picture
		next.classList.remove("arriving");
	},PHOTO_FADE_MS+200);
}

function nextphoto(){
	clearTimeout(phototimer);
	if(!photomode){ return; }
	if(photoqueue.length===0){ photoqueue=shuffled(photosource()); }
	const entry=photoqueue.pop();
	if(!entry){ return; }
	const picture=new Image();
	picture.src=entry.u;
	// decode first: the swap itself is then just a composite, never a visible load
	picture.decode().then(() => {
		if(!photomode){ return; }
		photoerrors=0;
		photocurrent=entry;
		crossfade(entry);
		photodaylight();
		phototimer=setTimeout(nextphoto,photoseconds()*1000);
	},() => {
		if(!photomode){ return; }
		if(++photoerrors>=PHOTO_FALLBACK_LIMIT){
			stopphotos();
			startlocalvideo();
			return;
		}
		nextphoto();
	});
}

// ---- wrap background.js's own entry points
(function(){
	const startsourcewas=window.startsource;
	window.startsource=function(kind){
		if(kind==="photos"){
			startphotos();
			return;
		}
		stopphotos();
		return startsourcewas.apply(this,arguments);
	};
	// "photos" alone would not tell applybackgroundsource() that t("Which photos") changed, so the
	// choice goes into the signature the way the custom list does
	const sourcesignaturewas=window.sourcesignature;
	window.sourcesignature=function(kind){
		if(kind==="photos"){ return kind+"/"+(typeof photomix==="function"?photomix():""); }
		return sourcesignaturewas.apply(this,arguments);
	};
	const wantedsourcewas=window.wantedsource;
	window.wantedsource=function(){
		if(prefs.videoSource==="photos" && typeof photos!=="undefined" && photos.length){ return "photos"; }
		return wantedsourcewas.apply(this,arguments);
	};
	const nowplayingwas=window.nowplaying;
	window.nowplaying=function(){
		if(photomode && photocurrent){
			return {name:photocurrent.n,source:photocurrent.s+", "+t("photo"),video:false};
		}
		return nowplayingwas.apply(this,arguments);
	};
	const skipvideowas=window.skipvideo;
	window.skipvideo=function(){
		if(photomode){
			nextphoto();
			return;
		}
		return skipvideowas.apply(this,arguments);
	};
	// nothing should be fetched while another app is in front
	setInterval(photodaylight,10*60*1000);
	document.addEventListener("visibilitychange",function(){
		if(!photomode){ return; }
		if(document.hidden){
			clearTimeout(phototimer);
			phototimer=null;
		} else if(phototimer===null){
			nextphoto();
		}
	});
})();
