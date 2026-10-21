//SPDX-License-Identifier: WTFNMFPL
// Weather widget: current temperature and conditions from Open-Meteo (https://open-meteo.com, free, no key).
// Settings: see the Weather tab in settings.js. Placement works like the date: under the clock or anywhere on screen.

const WEATHER_CACHE_KEY='openlauncher.weather';
const WEATHER_REFRESH_MS=10*60*1000;   // Open-Meteo itself refreshes about every 15 min, so going below this just refetches the same numbers

// WMO weather codes -> icon name (see icons.js) and text
function weatherinfo(code,isday){
	if(code===0){ return {icon:isday?"sun":"moon",text:t("Clear")}; }
	if(code===1){ return {icon:isday?"sun":"moon",text:t("Mostly clear")}; }
	if(code===2){ return {icon:isday?"partday":"partnight",text:t("Partly cloudy")}; }
	if(code===3){ return {icon:"cloud",text:t("Cloudy")}; }
	if(code===45 || code===48){ return {icon:"fog",text:t("Fog")}; }
	if(code>=51 && code<=57){ return {icon:"rain",text:t("Drizzle")}; }
	if(code>=61 && code<=67){ return {icon:"rain",text:t("Rain")}; }
	if((code>=71 && code<=77) || code===85 || code===86){ return {icon:"snow",text:t("Snow")}; }
	if(code>=80 && code<=82){ return {icon:"rain",text:t("Showers")}; }
	if(code>=95 && code<=99){ return {icon:"storm",text:t("Thunderstorm")}; }
	return {icon:"cloud",text:t("Unknown")};
}

let weatherdata=null;       // {temp, code, isday, at, unit, key, hours}

// the next few whole hours from Open-Meteo's hourly block, for the small forecast under the widget
const FORECAST_HOURS=12;      // the panel shows them all, the widget under the clock the first few
const FORECAST_WIDGET_HOURS=5;
// today's high, low and overall condition, for the panel the weather widget opens
function dayfigures(daily){
	if(!daily || !Array.isArray(daily.time) || daily.time.length===0){ return null; }
	return {max:daily.temperature_2m_max[0],min:daily.temperature_2m_min[0],code:daily.weather_code[0]};
}
// sunrise and sunset come free with the daily block we already ask for
function sunfigures(daily){
	if(!daily || !Array.isArray(daily.sunrise) || !daily.sunrise.length){ return null; }
	return {up:String(daily.sunrise[0]).slice(11,16),down:String(daily.sunset[0]).slice(11,16)};
}

function uvtoday(daily){
	return (daily && Array.isArray(daily.uv_index_max) && daily.uv_index_max.length)?daily.uv_index_max[0]:null;
}

// the seven-day block, for the iOS-style week list in the panel
function weekfigures(daily){
	if(!daily || !Array.isArray(daily.time)){ return []; }
	return daily.time.map((day,i) => ({
		t:day,
		max:daily.temperature_2m_max[i],
		min:daily.temperature_2m_min[i],
		code:daily.weather_code[i]
	})).filter((each) => isFinite(each.max) && isFinite(each.min));
}

function nexthours(hourly){
	if(!hourly || !Array.isArray(hourly.time)){ return []; }
	const now=Date.now();
	const out=[];
	for(let i=0;i<hourly.time.length && out.length<FORECAST_HOURS;i++){
		// "2026-10-20T14:00" is local time already (timezone=auto), so compare it as such
		const at=new Date(hourly.time[i].replace(" ","T")).getTime();
		if(!isFinite(at) || at<=now){ continue; }
		out.push({h:String(hourly.time[i]).slice(11,13),temp:hourly.temperature_2m[i],code:hourly.weather_code[i],isday:hourly.is_day?hourly.is_day[i]===1:true});
	}
	return out;
}
let weatherstatus="";       // shown under the Location box in settings

function weatherkey(){
	return prefs.weatherPlace?prefs.weatherPlace.lat+","+prefs.weatherPlace.lon+","+prefs.weatherUnit:"";
}

function loadweathercache(){
	try {
		const saved=JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
		if(saved && typeof saved.temp==="number" && typeof saved.code==="number" && typeof saved.key==="string"){ weatherdata=saved; }
	} catch(e) {}
}

function saveweathercache(){
	try {
		localStorage.setItem(WEATHER_CACHE_KEY,JSON.stringify(weatherdata));
	} catch(e) {}
}

// what the widget says, or null if there is nothing to show yet
function weathertext(){
	if(!prefs.weatherShow || !prefs.weatherPlace || !weatherdata || weatherdata.key!==weatherkey()){ return null; }
	const info=weatherinfo(weatherdata.code,weatherdata.isday);
	return {
		icon:info.icon,
		temp:Math.round(weatherdata.temp)+"°"+(prefs.weatherUnit==="f"?"F":"C"),
		detail:info.text+" · "+prefs.weatherPlace.name
	};
}

function renderweather(){
	const shown=weathertext();
	weather.style.display=shown?"":"none";
	if(!shown){ return; }
	weathericon.innerHTML=weathericonsvg(shown.icon);
	weathertemp.textContent=shown.temp;
	weatherdetail.textContent=shown.detail;
	renderforecast();
}

// Sunrise and sunset drawn as little suns over a horizon, rather than bare arrows: at this size
// an arrow alone reads as "scroll", while a half sun on a line reads immediately.
function sunglyph(rising){
	// A bold half sun on the horizon with a short chevron: at ~30px the chevron direction is the
	// only thing that must survive, so it is drawn thick and the sun kept simple underneath.
	const chevron=rising
		? '<path d="M21 23 32 12l11 11"/>'
		: '<path d="M21 12 32 23 43 12"/>';
	return '<svg class="sunicon" viewBox="0 0 64 64" aria-hidden="true">'+
		'<path d="M14 47a18 18 0 0 1 36 0z" fill="#FFB020"/>'+
		'<g fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">'+
			'<path d="M6 47h52"/>'+chevron+
		'</g>'+
	'</svg>';
}

const SUN_UP_SVG=sunglyph(true);
const SUN_DOWN_SVG=sunglyph(false);

// a quiet line with today's sunrise and sunset, under the forecast
function rendersun(){
	const sun=weatherdata && weatherdata.sun;
	let line=document.getElementById("sunline");
	if(!sun){
		if(line){ line.style.display="none"; }
		return;
	}
	if(!line){
		line=document.createElement("div");
		line.id="sunline";
		weather.appendChild(line);
	}
	line.style.display="";
	line.innerHTML='<span>'+SUN_UP_SVG+sun.up+'</span><span>'+SUN_DOWN_SVG+sun.down+'</span>';
}

// a row of the next few hours: hour, small icon, temperature
function renderforecast(){
	const box=document.getElementById("forecast");
	if(!box){ return; }
	const hours=(weatherdata && weatherdata.hours) || [];
	if(hours.length===0){
		box.style.display="none";
		box.innerHTML="";
		return;
	}
	box.style.display="";
	rendersun();
	box.innerHTML=hours.slice(0,FORECAST_WIDGET_HOURS).map((each) => {
		const info=weatherinfo(each.code,each.isday);
		return '<div class="fcell"><span class="fhour">'+each.h+'h</span>'+
			'<span class="ficon">'+weathericonsvg(info.icon)+'</span>'+
			'<span class="ftemp">'+Math.round(each.temp)+'\u00b0</span></div>';
	}).join("");
}

async function fetchweather(){
	if(!prefs.weatherShow || !prefs.weatherPlace){ return; }
	const place=prefs.weatherPlace;
	const key=weatherkey();
	const url="https://api.open-meteo.com/v1/forecast?latitude="+encodeURIComponent(place.lat)+"&longitude="+encodeURIComponent(place.lon)+
		"&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max&forecast_days=7&temperature_unit="+(prefs.weatherUnit==="f"?"fahrenheit":"celsius")+"&timezone=auto";
	try {
		const response=await fetch(url);
		if(!response.ok){ throw new Error("HTTP "+response.status); }
		const data=await response.json();
		const current=data.current;
		if(!current || typeof current.temperature_2m!=="number" || typeof current.weather_code!=="number"){ throw new Error("unexpected answer"); }
		if(key!==weatherkey()){ return; }   // the place or unit changed while this was loading
		weatherdata={temp:current.temperature_2m,code:current.weather_code,isday:current.is_day===1,at:Date.now(),key:key,hours:nexthours(data.hourly),week:weekfigures(data.daily),day:dayfigures(data.daily),sun:sunfigures(data.daily),uv:uvtoday(data.daily)};
		saveweathercache();
		weatherstatus=t("Updated ")+new Date(weatherdata.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
	} catch(e) {
		weatherstatus=t("Could not load the weather. Will try again.");
	}
	renderweather();
	if(settingsisopen()){ renderpane(); }
}

// look a place name up; resolves to {name, lat, lon} or null
async function findplace(query){
	const url="https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(query)+"&count=1&language=en&format=json";
	const response=await fetch(url);
	if(!response.ok){ throw new Error("HTTP "+response.status); }
	const data=await response.json();
	const found=data.results && data.results[0];
	if(!found || typeof found.latitude!=="number" || typeof found.longitude!=="number"){ return null; }
	return {name:[found.name,found.country].filter(Boolean).join(", "),lat:found.latitude,lon:found.longitude};
}

let weatherquery="";

async function searchweather(){
	const query=weatherquery.trim();
	if(query===""){ return; }
	weatherstatus=t("Searching...");
	renderpane();
	try {
		const place=await findplace(query);
		if(place){
			weatherstatus="";
			setpref("weatherPlace",place);   // saves, applies (which fetches) and redraws
		} else {
			weatherstatus=t("Nothing found for „")+query+"“.";
			renderpane();
		}
	} catch(e) {
		weatherstatus=t("Search failed. Check your internet connection.");
		renderpane();
	}
}

// the Location row in the Weather tab (a "custom" item, see settings.js)
function renderweatherplace(box){
	const line=el("div","scontrol");
	const input=el("input","stext");
	input.setAttribute("type","text");
	input.setAttribute("placeholder",prefs.weatherPlace?prefs.weatherPlace.name:t("City name"));
	input.value=weatherquery;
	input.addEventListener("input",() => {weatherquery=input.value;});
	input.addEventListener("keydown",(event) => {
		if(event.keyCode===13){ searchweather(); }
	});
	line.appendChild(input);
	line.appendChild(optionbutton(t("Search"),false,() => searchweather()));
	box.appendChild(line);
	const status=weatherstatus || (prefs.weatherPlace?t("Showing ")+prefs.weatherPlace.name:t("Type a city and press Search"));
	box.appendChild(el("div","sstatus",status));
}

// placement: under the clock and date, or on a layer of its own
function applyweatherplace(){
	const together=(prefs.weatherPos==="with-clock");
	(together?clockstack:weatherlayer).appendChild(weather);
	setposition(weatherlayer,together?prefs.clockPos:prefs.weatherPos);
	weatherlayer.style.display=together?"none":"";
}

// called by applyprefs()
function applyweather(){
	if(!prefs.weatherPlace){ weatherstatus=""; }   // no location: an old error message would be stale
	applyweatherplace();
	renderweather();
	if(prefs.weatherShow && prefs.weatherPlace && (!weatherdata || weatherdata.key!==weatherkey() || Date.now()-weatherdata.at>WEATHER_REFRESH_MS)){
		fetchweather();
	}
}

function initweather(){
	loadweathercache();
	// refresh every quarter of an hour while shown; the check is cheap and skips the network otherwise
	setInterval(() => {
		if(prefs.weatherShow && prefs.weatherPlace && !document.hidden && (!weatherdata || Date.now()-weatherdata.at>WEATHER_REFRESH_MS)){
			fetchweather();
		}
	},60*1000);
	applyweather();
}

document.addEventListener("DOMContentLoaded",initweather);
