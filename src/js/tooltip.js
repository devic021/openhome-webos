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
	if(el.namelabel && el.namelabel.innerText){ return el.namelabel.innerText; }
	const label=el.querySelector && el.querySelector(".appname");
	if(label && label.innerText){ return label.innerText; }
	return el.getAttribute("title") || el.getAttribute("aria-label") || "";
}

function tiphide(){
	if(tipbox){ tipbox.classList.remove("on"); }
}

function tipshow(el){
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
	tipbox.textContent=text;
	tipbox.classList.add("on");
	// centred over the icon, kept inside the screen
	const rect=el.getBoundingClientRect();
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
