//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// Richer weather icons: small coloured illustrations (gradients, layered clouds, drops, a bolt)
// instead of the flat single-colour Material glyphs in icons.js. Names match weatherinfo() in
// weather.js: sun, moon, partday, partnight, cloud, fog, rain, snow, storm.
//
// Every shape carries its own explicit fill, so the `fill: currentColor` the stylesheet puts on
// the <svg> never flattens them. weathericonsvg() falls back to the flat icon for any unknown name.

// the cloud body, reused by most of the icons: three circles over a rounded base, so the outline is
// always clean (no hand-tuned bezier that can self-intersect at small sizes)
function wcloud(fill,dx,dy,scale){
	const t='transform="translate('+(dx||0)+','+(dy||0)+') scale('+(scale||1)+')"';
	return '<g '+t+' fill="'+fill+'">'+
		'<circle cx="23" cy="38" r="9"/>'+
		'<circle cx="36" cy="32" r="13"/>'+
		'<circle cx="47" cy="39" r="8"/>'+
		'<rect x="21" y="38" width="27" height="9" rx="4.5"/>'+
	'</g>';
}

// the sun disc with rays
function wsun(cx,cy,r,gradid){
	let rays="";
	for(let i=0;i<8;i++){
		const a=i*45*Math.PI/180;
		const x1=cx+Math.cos(a)*(r+4.5), y1=cy+Math.sin(a)*(r+4.5);
		const x2=cx+Math.cos(a)*(r+9),  y2=cy+Math.sin(a)*(r+9);
		rays+='<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+
			'" stroke="#FFB020" stroke-width="3.4" stroke-linecap="round"/>';
	}
	return rays+'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="url(#'+gradid+')"/>';
}

const SUN_GRAD='<radialGradient id="wgSun" cx="35%" cy="30%"><stop offset="0" stop-color="#FFE98A"/><stop offset="1" stop-color="#FF9F1C"/></radialGradient>';
const MOON_GRAD='<linearGradient id="wgMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8FAFF"/><stop offset="1" stop-color="#C3CEEA"/></linearGradient>';
const CLOUD_GRAD='<linearGradient id="wgCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C6D2E3"/></linearGradient>';
const DARK_GRAD='<linearGradient id="wgDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9B6C9"/><stop offset="1" stop-color="#6B7A90"/></linearGradient>';

function wmoon(cx,cy,r){
	// a crescent: the disc with a second disc punched out of its upper right
	return '<path fill="url(#wgMoon)" d="M'+(cx+r*0.55)+' '+(cy-r)+
		'a'+r+' '+r+' 0 1 0 '+(r*0.75)+' '+(r*1.25)+
		' '+r*0.85+' '+r*0.85+' 0 0 1 -'+(r*0.75)+' -'+(r*1.25)+'z"/>';
}

function wsvg(defs,body){
	return '<svg class="rich" viewBox="0 0 64 64" aria-hidden="true"><defs>'+defs+'</defs>'+body+'</svg>';
}

const WEATHER_SVG={
	sun: wsvg(SUN_GRAD, wsun(32,32,11,"wgSun")),

	moon: wsvg(MOON_GRAD, wmoon(34,32,13)),

	cloud: wsvg(CLOUD_GRAD, wcloud("url(#wgCloud)",0,-2,1)),

	partday: wsvg(SUN_GRAD+CLOUD_GRAD,
		'<g transform="translate(-4,-6) scale(0.78)">'+wsun(28,28,9,"wgSun")+'</g>'+
		wcloud("url(#wgCloud)",2,2,0.92)),

	partnight: wsvg(MOON_GRAD+CLOUD_GRAD,
		'<g transform="translate(-2,-7) scale(0.8)">'+wmoon(30,28,11)+'</g>'+
		wcloud("url(#wgCloud)",2,2,0.92)),

	fog: wsvg(CLOUD_GRAD,
		wcloud("url(#wgCloud)",0,-7,0.92)+
		'<g stroke="#AEBCCF" stroke-width="4" stroke-linecap="round">'+
		'<line x1="16" y1="48" x2="48" y2="48"/>'+
		'<line x1="21" y1="56" x2="43" y2="56"/>'+
		'</g>'),

	rain: wsvg(CLOUD_GRAD,
		wcloud("url(#wgCloud)",0,-8,0.92)+
		'<g fill="#3BA7F0">'+
		'<path d="M24 48c1.7 2.4 2.8 4 2.8 5.2a2.8 2.8 0 0 1-5.6 0c0-1.2 1.1-2.8 2.8-5.2z"/>'+
		'<path d="M34 51c1.7 2.4 2.8 4 2.8 5.2a2.8 2.8 0 0 1-5.6 0c0-1.2 1.1-2.8 2.8-5.2z"/>'+
		'<path d="M44 48c1.7 2.4 2.8 4 2.8 5.2a2.8 2.8 0 0 1-5.6 0c0-1.2 1.1-2.8 2.8-5.2z"/>'+
		'</g>'),

	snow: wsvg(CLOUD_GRAD,
		wcloud("url(#wgCloud)",0,-8,0.92)+
		'<g stroke="#9ED8FF" stroke-width="2.6" stroke-linecap="round">'+
		'<g transform="translate(24,53)"><line x1="-4" y1="0" x2="4" y2="0"/><line x1="-2" y1="-3.5" x2="2" y2="3.5"/><line x1="2" y1="-3.5" x2="-2" y2="3.5"/></g>'+
		'<g transform="translate(40,53)"><line x1="-4" y1="0" x2="4" y2="0"/><line x1="-2" y1="-3.5" x2="2" y2="3.5"/><line x1="2" y1="-3.5" x2="-2" y2="3.5"/></g>'+
		'</g>'),

	storm: wsvg(DARK_GRAD,
		wcloud("url(#wgDark)",0,-8,0.92)+
		'<path fill="#FFC21A" d="M34 44l-10 14h7l-3 10 12-15h-7l4-9z"/>')
};

// what weather.js asks for; unknown names fall back to the flat icon set
function weathericonsvg(name){
	if(WEATHER_SVG[name]){ return WEATHER_SVG[name]; }
	return (typeof iconsvg==="function")?iconsvg(name):"";
}
