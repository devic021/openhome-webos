//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// One floating label for whichever dock icon (or input shortcut) has the focus or the pointer,
// instead of a caption printed under every single icon. The dock then reads as a row of artwork
// and only the thing you are actually on is named.
//
// It hooks dpad.js's setfocus() (a plain global function) so the remote drives it, and watches the
// pointer for the Magic Remote. The app drawer keeps its own captions, so it is left alone.

let tipbox=null;

function tiptarget(node){
	for(let at=node;at && at!==document;at=at.parentNode){
		// the two corner buttons name themselves the same way the shortcuts do
		if(at.id==="infobtn" || at.id==="homesettings"){ return at; }
		if(at.classList && (at.classList.contains("appitem") || at.classList.contains("qchip"))){
			// only the dock and the input shortcuts: the drawer already labels its tiles
			const inbar=typeof appbar!=="undefined" && appbar.contains(at);
			const inquick=typeof quickrow!=="undefined" && quickrow && quickrow.contains(at);
			return (inbar || inquick)?at:null;
		}
	}
	return null;
}

function tipname(el){
	// textContent, not innerText: innerText has to lay the page out to answer, and this runs on
	// every key press. The names are plain text, so both give the same string.
	if(el.namelabel && el.namelabel.textContent){ return el.namelabel.textContent; }
	const label=el.querySelector && el.querySelector(".appname");
	if(label && label.textContent){ return label.textContent; }
	return el.getAttribute("title") || el.getAttribute("aria-label") || "";
}

let tipfor=null;            // the element the label should be over, placed on the next frame
let tipframe=0;

function tiphide(){
	tipfor=null;
	if(tipbox){ tipbox.classList.remove("on"); }
}

// Holding an arrow fires a key press every few dozen milliseconds. Placing the label inside each
// one (set the text, then read the tile's box and the label's size) forced a full layout per
// repeat. Now each press only notes which tile it is on, and the label is placed once per frame,
// when the layout is fresh anyway.
function tipshow(el){
	tipfor=el;
	if(tipframe){ return; }
	tipframe=requestAnimationFrame(() => {
		tipframe=0;
		if(tipfor){ tipplace(tipfor); }
	});
}

function tipplace(el){
	const text=tipname(el);
	if(!text){
		tiphide();
		return;
	}
	if(!tipbox){
		tipbox=document.createElement("div");
		tipbox.id="tipbox";
		maindiv.appendChild(tipbox);
	}
	// every read first, then every write, so the browser lays out once
	const rect=el.getBoundingClientRect();
	if(tipbox.textContent!==text){ tipbox.textContent=text; }
	tipbox.classList.add("on");
	// centred over the icon, kept inside the screen
	const width=tipbox.offsetWidth;
	const left=Math.max(12,Math.min(window.innerWidth-width-12,rect.left+rect.width/2-width/2));
	tipbox.style.left=Math.round(left)+"px";
	tipbox.style.top=Math.round(rect.top-tipbox.offsetHeight-14)+"px";
}

(function(){
	const setfocuswas=window.setfocus;
	if(typeof setfocuswas==="function"){
		window.setfocus=function(el){
			const result=setfocuswas.apply(this,arguments);
			const target=el?tiptarget(el):null;
			if(target){ tipshow(target); } else { tiphide(); }
			return result;
		};
	}
	document.addEventListener("mouseover",function(event){
		const target=tiptarget(event.target);
		if(target){ tipshow(target); } else if(!document.querySelector(".appitem.dfocus,.qchip.dfocus")){ tiphide(); }
	});
	// the drawer covers the dock, so nothing should be left hanging over it
	document.addEventListener("change",function(){ if(realappbarbtu.checked){ tiphide(); } },true);
})();
