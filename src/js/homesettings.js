//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// A way into the launcher's own settings from the home screen.
//
// They used to live only on the Settings button inside the app drawer, which is easy to miss -
// especially since the gear ON the dock is the TV's settings app, not this one's. This puts a
// second gear next to the wallpaper info button, and teaches dpad.js that it can be focused.

// A gear drawn with a thin stroke instead of the solid Material glyph, so it sits lightly in the
// corner and matches the stroked icons in the status bar.
function thingear(){
	const teeth=8, inner=13, outer=19, step=Math.PI*2/teeth;
	let d="";
	for(let i=0;i<teeth;i++){
		const a=i*step, b=a+step*0.46, c=a+step*0.54, e=a+step;
		const pt=(r,ang) => (32+r*Math.cos(ang)).toFixed(1)+" "+(32+r*Math.sin(ang)).toFixed(1);
		d+=(i===0?"M":"L")+pt(outer,a)+"L"+pt(outer,b)+"L"+pt(inner,c)+"L"+pt(inner,e);
	}
	d+="Z";
	return '<svg viewBox="0 0 64 64" aria-hidden="true">'+
		'<path d="'+d+'" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"/>'+
		'<circle cx="32" cy="32" r="6.5" fill="none" stroke="currentColor" stroke-width="3.4"/>'+
	'</svg>';
}

(function(){
	const button=document.createElement("button");
	button.id="homesettings";
	button.setAttribute("title",t("Launcher settings"));
	button.setAttribute("aria-label",t("Launcher settings"));
	button.innerHTML=thingear();
	button.addEventListener("click",function(){
		if(typeof opensettings==="function"){ opensettings(); }
	});
	maindiv.appendChild(button);

	// the remote reaches it the same way it reaches the info button
	const contextelementswas=window.contextelements;
	window.contextelements=function(){
		const base=contextelementswas.apply(this,arguments);
		if(!realappbarbtu.checked && !settingsisopen() && isvisible(button) && base.indexOf(button)===-1){
			return base.concat([button]);
		}
		return base;
	};
})();
