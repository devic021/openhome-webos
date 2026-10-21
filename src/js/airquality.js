//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// Air quality and pollen, from Open-Meteo's air-quality API (free, no key, same provider as the
// weather). Shown as small chips under the forecast - but only when they have something to say:
// clean air, no pollen and a weak sun draw nothing at all, so the screen stays quiet most of the
// year and the chip appearing is itself the signal.
//
// Locally this matters: Vojvodina gets real winter smog, and ragweed (ambrozija) season in Srem
// is no joke.

const AIR_REFRESH_MS=30*60*1000;
const AQI_SHOW_FROM=50;        // European AQI: 0-20 good, 20-40 fair, 40-60 moderate, 60-80 poor
const POLLEN_SHOW_FROM=5;      // grains/m3: below this nobody notices
const UV_SHOW_FROM=5;          // high enough to bother protecting against

let airdata=null;

function airchipsbox(){
	let box=document.getElementById("envchips");
	if(!box){
		box=document.createElement("div");
		box.id="envchips";
		// inside the weather widget, so it follows wherever the weather is placed
		weather.appendChild(box);
	}
	return box;
}

// European AQI bands -> colour + word
function aqiband(value){
	if(value<=40){ return {c:"#4ADE80",t:t("good")}; }
	if(value<=60){ return {c:"#FACC15",t:t("moderate")}; }
	if(value<=80){ return {c:"#FB923C",t:t("poor")}; }
	return {c:"#F87171",t:t("very poor")};
}

function pollenband(value){
	if(value<20){ return {c:"#FACC15",t:t("low")}; }
	if(value<50){ return {c:"#FB923C",t:t("moderate")}; }
	return {c:"#F87171",t:t("high")};
}

function envchip(colour,label,value){
	const chip=document.createElement("span");
	chip.className="envchip";
	const dot=document.createElement("i");
	dot.style.backgroundColor=colour;
	chip.appendChild(dot);
	const text=document.createElement("span");
	text.innerHTML='<b>'+label+'</b> '+value;
	chip.appendChild(text);
	return chip;
}

function renderair(){
	const box=airchipsbox();
	box.innerHTML="";
	if(!airdata){ return; }
	// air, only once it stops being good
	if(isFinite(airdata.aqi) && airdata.aqi>AQI_SHOW_FROM){
		const band=aqiband(airdata.aqi);
		box.appendChild(envchip(band.c,t("Air"),band.t+" · PM2.5 "+Math.round(airdata.pm25)));
	}
	// whichever pollen is actually in the air right now
	const pollens=[[t("Ragweed"),airdata.ragweed],[t("Grass"),airdata.grass],[t("Birch"),airdata.birch]]
		.filter((each) => isFinite(each[1]) && each[1]>=POLLEN_SHOW_FROM)
		.sort((a,b) => b[1]-a[1]);
	if(pollens.length){
		const band=pollenband(pollens[0][1]);
		box.appendChild(envchip(band.c,pollens[0][0],band.t));
	}
	// the sun, only when it can burn you
	if(typeof weatherdata!=="undefined" && weatherdata && isFinite(weatherdata.uv) && weatherdata.uv>=UV_SHOW_FROM){
		const uv=weatherdata.uv;
		box.appendChild(envchip(uv>=8?"#F87171":"#FB923C","UV",Math.round(uv)));
	}
}

async function fetchair(){
	if(!prefs.weatherShow || !prefs.weatherPlace){ return; }
	const place=prefs.weatherPlace;
	const url="https://air-quality-api.open-meteo.com/v1/air-quality?latitude="+encodeURIComponent(place.lat)+
		"&longitude="+encodeURIComponent(place.lon)+
		"&current=pm2_5,pm10,european_aqi,ragweed_pollen,grass_pollen,birch_pollen&timezone=auto";
	try {
		const response=await fetch(url);
		if(!response.ok){ throw new Error("HTTP "+response.status); }
		const data=await response.json();
		const now=data.current || {};
		airdata={
			aqi:now.european_aqi,
			pm25:now.pm2_5,
			pm10:now.pm10,
			ragweed:now.ragweed_pollen,
			grass:now.grass_pollen,
			birch:now.birch_pollen,
			at:Date.now()
		};
	} catch(e) {}
	renderair();
}

function initair(){
	fetchair();
	setInterval(() => { if(!document.hidden){ fetchair(); } },AIR_REFRESH_MS);
}

document.addEventListener("DOMContentLoaded",() => setTimeout(initair,3000));
