//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// Wallpaper cross-fade. background.js swaps #bgvideo.src with a hard cut; here we fade the
// single video element through black at every switch point, which reads as a clean fade-out/in
// without the cost (or the single-hardware-plane risk) of a second, overlapping <video>.
//
// How: the switch functions in background.js are plain global function declarations, so after
// that file has loaded we wrap each one to first drop the element's opacity, wait out the CSS
// transition, then run the original (which sets the new src). The "playing" event fades it back
// in. If anything here fails, the worst case is background.js's original hard cut.
(function(){
	var v=document.getElementById("bgvideo");
	if(!v){ return; }
	var FADE=340;   // ms; keep in step with --fade-ms in css/theme.css

	function fadein(){ v.style.opacity="1"; }
	// any of these mean a frame is on screen now
	v.addEventListener("playing",fadein);
	v.addEventListener("loadeddata",fadein);
	v.addEventListener("canplaythrough",fadein);

	// fade out, let the CSS transition run, then swap the source via the original function
	function wrap(name){
		var orig=window[name];
		if(typeof orig!=="function"){ return; }
		window[name]=function(){
			var self=this,args=arguments;
			v.style.opacity="0";
			setTimeout(function(){ orig.apply(self,args); },FADE);
		};
	}
	// every place background.js starts a different clip or source. nextaerial covers the aerials
	// (startaerials calls it), nextcustom the custom list, startlocalvideo the built-in loop.
	["nextaerial","nextcustom","startlocalvideo"].forEach(wrap);
})();
