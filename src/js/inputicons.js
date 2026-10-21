//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// Our own glyphs for the input shortcuts.
//
// The TV's own input artwork is per-device and looks right in LG's home screen, but each file
// carries its own baked-in background - a grey rounded square behind the PlayStation mark, a
// different grey behind the HDMI one - so a row of them never looks like a set. There is no way
// to take that background off a PNG.
//
// These are drawn instead: one weight, one box, no background, inheriting colour from the chip
// they sit in. Same convention the info button and the gear already use - a 64 unit box, 3.4
// stroke, round caps - so everything on the home screen is drawn by the same hand.
//
// Specificity is kept where it matters: a console that announces itself over CEC as a
// PlayStation still gets a gamepad rather than a bare HDMI socket.

// Each glyph is {box, markup}. Most are drawn with the house stroke in a 64 unit box; the
// PlayStation mark is the real logo, which is filled and carries its own coordinate space.
const INPUT_GLYPHS={
	// a screen with its antenna
	livetv:'<rect x="9" y="22" width="46" height="31" rx="5"/>'+
		'<path d="M32 22 L20 9 M32 22 L44 9"/>',

	// the HDMI connector seen end on
	hdmi:'<path d="M11 24 H53 V35 L46 42 H18 L11 35 Z"/>'+
		'<path d="M20 30 H44"/>',

	// The PlayStation logo itself. Redrawing it by hand failed twice - it is two letters
	// overlapping in perspective and does not survive being approximated with a 3.4 stroke.
	// This is the real artwork, kept in its own coordinate space with its own transform, so
	// nothing about it is guessed. It is filled rather than stroked, hence the flag.
	//
	// The mark is Sony's trademark. It is here to identify a console that tells the TV over
	// CEC that it is a PlayStation - the same use LG's own input artwork makes of it - and it
	// is not covered by this project's licence. See LICENSING.md.
	// The logo's own box is 258x200 and the artwork fills it edge to edge, while the stroked
	// glyphs leave a wide margin inside their 64 unit square. At the same 42px that made the
	// PlayStation mark sit noticeably larger than the HDMI socket beside it. A squared box with
	// the art centred in it brings them to the same visual weight: the mark spans 265 units
	// inside a 327 unit square, so it lands about 34px wide in a 42px chip.
	playstation:{fill:true,box:"-35.5 -63.5 327 327",markup:
		'<g transform="matrix(6.446238,0,0,6.451613,-32.166372,-61.290323)">'+
		'<path d="M5.8,32.1C4.3,33.1 4.8,35 8,35.9C11.3,37 14.9,37.3 18.4,36.7C18.6,36.7 18.8,36.6 '+
		'18.9,36.6L18.9,33.2L15.5,34.3C14.2,34.7 12.9,34.8 11.6,34.5C10.6,34.2 10.8,33.6 '+
		'12,33.1L18.9,30.7L18.9,27L9.3,30.3C8.1,30.7 6.9,31.3 5.8,32.1ZM29,17.1L29,26.8C33.1,28.8 '+
		'36.3,26.8 36.3,21.6C36.3,16.3 34.4,13.9 28.9,12C26,11 23,10.1 20,9.5L20,38.4L27,40.5L27,16.2C27,'+
		'15.1 27,14.3 27.8,14.6C28.9,14.9 29,16 29,17.1ZM42,29.8C39.1,28.8 36,28.4 33,28.7C31.4,28.8 '+
		'29.9,29.2 28.5,29.7L28.2,29.8L28.2,33.7L34.7,31.3C36,30.9 37.3,30.8 38.6,31.1C39.6,31.4 '+
		'39.4,32 38.2,32.5L28.2,36.2L28.2,40L42,34.9C43,34.5 43.9,34 44.7,33.2C45.4,32.2 45.1,30.8 '+
		'42,29.8Z" fill="currentColor" fill-rule="nonzero"/></g>'},

	// a gamepad: body, d-pad, two buttons
	console:'<rect x="7" y="24" width="50" height="21" rx="10.5"/>'+
		'<path d="M19 29 V40 M13.5 34.5 H24.5"/>'+
		'<circle cx="42" cy="30.5" r="2.4" fill="currentColor" stroke="none"/>'+
		'<circle cx="48" cy="38" r="2.4" fill="currentColor" stroke="none"/>',

	// a monitor on a stand
	computer:'<rect x="8" y="13" width="48" height="30" rx="4"/>'+
		'<path d="M32 43 V51 M22 51 H42"/>',

	// a laptop
	laptop:'<rect x="14" y="15" width="36" height="24" rx="3"/>'+
		'<path d="M7 46 H57"/>',

	// a set-top box or a player
	settop:'<rect x="8" y="25" width="48" height="17" rx="4"/>'+
		'<path d="M15 33.5 H33"/>'+
		'<circle cx="46" cy="33.5" r="2.6" fill="currentColor" stroke="none"/>',

	// a streaming stick
	stick:'<rect x="9" y="27" width="36" height="13" rx="6.5"/>'+
		'<path d="M45 30 H55 V37 H45"/>',

	// a USB-C or DisplayPort plug
	plug:'<rect x="9" y="27" width="46" height="13" rx="6.5"/>'+
		'<path d="M18 33.5 H46"/>',

	// anything we have no better idea about: a socket with something going into it
	generic:'<rect x="9" y="19" width="46" height="31" rx="5"/>'+
		'<path d="M32 42 V26 M25 33 L32 26 L39 33"/>'
};

// What a device calls itself is the best clue we get. CEC gives an osdName like "PlayStation5";
// where there is none, LG's own asset filename ("ps3.png", "pc.png") says what it thought the
// device was. Both are matched, in that order.
const INPUT_RULES=[
	[/playstation|\bps[345]\b/i,"playstation"],
	[/xbox|nintendo|switch|steam ?deck|console/i,"console"],
	[/\bpc\b|computer|desktop|imac|mac ?mini|windows/i,"computer"],
	[/laptop|macbook|notebook/i,"laptop"],
	[/apple ?tv|chromecast|fire ?tv|roku|shield|mi ?box|stick|dongle/i,"stick"],
	[/blu-?ray|\bdvd\b|player|receiver|soundbar|amplifier|\bav[rs]?\b|set-?top|decoder|satellite/i,"settop"],
	[/camera|camcorder/i,"generic"]
];

// Pick a glyph for one input. `device` is the TV's own record for it, when there is one.
function inputglyphname(app,device){
	const id=app.id||"";
	if(/^com\.webos\.app\.livetv$/.test(id)){ return "livetv"; }
	if(/^com\.webos\.app\.(dp\d+|usbc\d+)$/.test(id)){ return "plug"; }

	const clues=[device&&device.label,device&&device.icon];
	if(device&&Array.isArray(device.subList)){
		device.subList.forEach((each) => { if(each&&each.osdName){ clues.push(each.osdName); } });
	}
	const text=clues.filter(Boolean).join(" ");
	for(let i=0;i<INPUT_RULES.length;i++){
		if(INPUT_RULES[i][0].test(text)){ return INPUT_RULES[i][1]; }
	}
	// a port with something on it, but nothing that says what: the socket itself
	if(/^com\.webos\.app\.hdmi\d+$/.test(id)){ return "hdmi"; }
	return "generic";
}

function inputglyph(app,device){
	const shape=INPUT_GLYPHS[inputglyphname(app,device)];
	if(!shape){ return null; }
	if(typeof shape==="object" && shape.fill){
		return '<svg class="qglyph" viewBox="'+shape.box+'" aria-hidden="true" '+
			'fill="currentColor">'+shape.markup+'</svg>';
	}
	return '<svg class="qglyph" viewBox="0 0 64 64" aria-hidden="true" fill="none" '+
		'stroke="currentColor" stroke-width="3.4" stroke-linecap="round" '+
		'stroke-linejoin="round">'+shape+'</svg>';
}
