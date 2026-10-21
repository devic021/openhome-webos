//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// What a brand-new install looks like.
//
// Upstream's default bar is a fixed list of app ids, three of them games that almost no
// television has. On anyone else's set those entries match nothing, so a fresh install showed a
// half-empty bar - gaps where another person's apps used to be.
//
// So nothing here is assumed. The bar is built from what this television actually reports, and
// the folders are only made when there is something to put in them. All of it runs once, on the
// very first launch; after that the layout is whatever you made it, and this file keeps quiet.

const FIRSTRUN_KEY="openlauncher.firstrun";
const FIRSTRUN_BAR_MAX=10;

// Live TV earns a place; the other inputs do not. A set has four HDMI ports, two DisplayPorts and
// two USB-C ports whether or not anything is plugged into any of them, and putting all of them on
// the bar filled it with empty sockets and left room for one app. The inputs already have their
// own row above the dock (js/quick.js), which shows only the ones with something connected.
const FIRSTRUN_LIVETV="com.webos.app.livetv";

// Then the apps worth reaching in one press. These are matched against what is installed and
// anything absent is simply skipped, so an id that is wrong or model-specific costs nothing.
const FIRSTRUN_FAVOURITES=[
	"netflix","youtube.leanback.v4","youtube.leanback.v4.ad","amazon","com.wbd.stream",
	"com.disney.disneyplus-prod","com.apple.appletv","com.skyshowtime.tv","com.spotify.tv.webos",
	"io.strem.tv","com.webos.app.mediadiscovery","com.webos.app.browser","org.webosbrew.hbchannel"
];

// Folders are only made when at least this many of their apps are present - one app in a folder
// is more work to reach than no folder at all.
const FIRSTRUN_FOLDER_MIN=2;
const FIRSTRUN_FOLDERS=[
	{name:"Streaming",ids:[
		"netflix","youtube.leanback.v4","youtube.leanback.v4.ad","amazon","com.wbd.stream",
		"com.disney.disneyplus-prod","com.apple.appletv","com.skyshowtime.tv","io.strem.tv",
		"com.plexapp.plex","tv.twitch.tv.webos"]},
	{name:"Games",ids:[
		"com.geforcenow.play","com.webos.app.gameoptimizer","com.amazon.luna",
		"com.famobi.ctr","com.halfbrick.fruitninja","com.github.k4zmu2a.space-cadet-pinball"]},
	{name:"Tools",ids:[
		"org.webosbrew.hbchannel","com.webos.app.browser","com.webos.app.mediadiscovery",
		"com.webos.app.homeconnect","com.webos.app.lifeonscreen"]}
];

function firstrundone(){
	try { return localStorage.getItem(FIRSTRUN_KEY)!==null; } catch(e) { return true; }
}

function firstrunmark(){
	try { localStorage.setItem(FIRSTRUN_KEY,new Date().toISOString().slice(0,10)); } catch(e) {}
}

// The bar a never-configured install shows. main.js asks for this instead of a fixed list.
function firstrunbar(){
	if(typeof applist==="undefined" || !applist || !applist.length){ return []; }
	const installed={};
	applist.forEach((app) => { installed[app.id]=app; });
	const out=[];
	const add=(id) => { if(installed[id] && out.indexOf(id)===-1 && out.length<FIRSTRUN_BAR_MAX){ out.push(id); } };

	add(FIRSTRUN_LIVETV);
	FIRSTRUN_FAVOURITES.forEach(add);

	// Still room? Fill it with whatever else was installed by hand - anything the TV did not ship
	// with is there because somebody wanted it.
	applist.filter((app) => app.systemApp===false && app.visible!==false && app.id!==appid)
		.map((app) => app.id)
		.forEach(add);
	return out;
}

// Group what is installed, once. Uses the same folder machinery as the TV's own groups, so these
// are ordinary folders afterwards: rename them, empty them, delete them.
function firstrunfolders(){
	if(typeof applist==="undefined" || !applist || !applist.length){ return false; }
	const installed={};
	applist.forEach((app) => { if(app.visible!==false){ installed[app.id]=true; } });
	let changed=false;
	FIRSTRUN_FOLDERS.forEach((group) => {
		const members=group.ids.filter((id) => installed[id] && !settings.appfolder[id]);
		if(members.length<FIRSTRUN_FOLDER_MIN){ return; }
		if(settings.folders.length>=FOLDER_MAX){ return; }
		// a folder with this name may already exist, in which case it is left alone
		if(settings.folders.some((folder) => folder.name===t(group.name))){ return; }
		const folder={id:"first-"+group.name.toLowerCase(),name:t(group.name)};
		settings.folders=settings.folders.concat([folder]);
		members.forEach((id) => { settings.appfolder[id]=folder.id; });
		changed=true;
	});
	return changed;
}


// ---- where the weather starts out
//
// A new install had no location, so switching Weather on appeared to do nothing at all - it
// fetches only once a place is set, and the pane's "Type a city and press Search" is easy to
// miss. Hard-coding a default city is no answer either: it is wrong for everybody outside one
// country.
//
// The television already knows. Its time zone carries a city and a country code - Europe/Belgrade
// reports City "Belgrade", CountryCode "RS" - which is accurate to the region and needs no
// geolocation service, no IP lookup and nothing the owner did not already tell the set.
async function firstrunplace(){
	if(prefs.weatherPlace){ return; }                 // never overwrite a chosen location
	// Reading the "time" category is not allowed to an ordinary app - it answers "Access denied" -
	// so this goes through the root service. Without root there is no location to start from, and
	// the pane's own search is the way in.
	const ask={category:"time",keys:["timeZone"]};
	let answer=null;
	try { answer=await lunacall('luna://com.webos.settingsservice/getSystemSettings',ask); } catch(e) {}
	if((!answer || answer.returnValue===false) && typeof lunacallasroot==="function"){
		try { answer=await lunacallasroot('luna://com.webos.settingsservice/getSystemSettings',ask); } catch(e) {}
	}
	const zone=answer && answer.settings && answer.settings.timeZone;
	if(!zone || !zone.City){ return; }
	const city=zone.City;
	const code=zone.CountryCode || null;
	try {
		// several matches, then the one in the TV's own country - "Belgrade" also exists in Montana
		const url="https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(city)+
			"&count=10&language=en&format=json";
		const response=await fetch(url);
		if(!response.ok){ return; }
		const data=await response.json();
		const list=(data && data.results) || [];
		const found=list.filter((r) => !code || r.country_code===code)[0] || list[0];
		if(!found || typeof found.latitude!=="number"){ return; }
		if(prefs.weatherPlace){ return; }              // the owner may have set one while this ran
		setpref("weatherPlace",{
			name:[found.name,found.country].filter(Boolean).join(", "),
			lat:found.latitude,lon:found.longitude
		});
	} catch(e) {}
}

// Called from main.js once the app list has arrived.
function firstrun(){
	if(firstrundone()){ return; }
	firstrunmark();
	firstrunplace();                                   // network call, so it is not waited on
	if(typeof applist==="undefined" || !applist || !applist.length){ return; }
	if(firstrunfolders()){ savesettings(); }
}
