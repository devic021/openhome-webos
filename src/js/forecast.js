//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// The weather widget becomes a button: OK (or a click) on it opens a panel with today's high and
// low and the next twelve hours. Back closes it again.
//
// It plugs into dpad.js the way the rest of this launcher does - by wrapping that file's own global
// functions - so the remote reaches the widget at home, and Back knows about one more layer.

const FORECAST_PANEL_HOURS=12;
let fcpanel=null;

function forecastopen(){
	return maindiv.classList.contains("fcopen");
}

function fccell(hour,code,isday,temp){
	const info=weatherinfo(code,isday);
	return '<div class="fcell"><span class="fhour">'+hour+'h</span>'+
		'<span class="ficon">'+weathericonsvg(info.icon)+'</span>'+
		'<span class="ftemp">'+Math.round(temp)+'°</span></div>';
}

// The week, laid out the way iOS does it: a shared temperature scale across all the days, so each
// day's bar shows both how warm it gets and where that sits against the rest of the week.
const DAY_NAMES=[t("Sun"),t("Mon"),t("Tue"),t("Wed"),t("Thu"),t("Fri"),t("Sat")];

function weekhtml(){
	const week=(weatherdata && weatherdata.week) || [];
	if(week.length<2){ return ""; }
	const low=Math.min.apply(null,week.map((each) => each.min));
	const high=Math.max.apply(null,week.map((each) => each.max));
	const span=(high-low)||1;
	const now=weatherdata?weatherdata.temp:null;
	return '<div id="fcweek">'+week.map((each,index) => {
		const info=weatherinfo(each.code,true);
		const left=(each.min-low)/span*100;
		const width=Math.max(4,(each.max-each.min)/span*100);
		// where today's reading sits on its own bar
		let dot="";
		if(index===0 && now!==null && each.max>each.min){
			const at=Math.max(0,Math.min(100,(now-each.min)/(each.max-each.min)*100));
			dot='<i class="fcdot" style="left:'+at.toFixed(1)+'%"></i>';
		}
		const date=new Date(each.t+"T12:00");
		const name=index===0?t("Today"):(DAY_NAMES[date.getDay()]||"");
		return '<div class="fcday">'+
			'<span class="fcdayname">'+name+'</span>'+
			'<span class="fcdayicon">'+weathericonsvg(info.icon)+'</span>'+
			'<span class="fcmin">'+Math.round(each.min)+'\u00b0</span>'+
			'<span class="fcbar"><i class="fcfill" style="left:'+left.toFixed(1)+'%;width:'+width.toFixed(1)+'%">'+dot+'</i></span>'+
			'<span class="fcmax">'+Math.round(each.max)+'\u00b0</span>'+
		'</div>';
	}).join("")+'</div>';
}

function renderforecastpanel(){
	if(!fcpanel){
		fcpanel=document.createElement("div");
		fcpanel.id="fcpanel";
		maindiv.appendChild(fcpanel);
	}
	const place=(prefs.weatherPlace && prefs.weatherPlace.name) || t("Weather forecast");
	const unit=prefs.weatherUnit==="f"?"F":"C";
	const hours=(weatherdata && weatherdata.hours) || [];
	const day=weatherdata && weatherdata.day;
	const now=weatherdata?weatherinfo(weatherdata.code,weatherdata.isday):null;
	let html='<div id="fchead"><div id="fctitle">'+place+'</div>'+
		'<button id="fcrefresh" title="'+t("Refresh")+'" aria-label="'+t("Refresh")+'">'+iconsvg("reset")+'</button>'+
		'<button id="fcclose" title="'+t("Close")+'" aria-label="'+t("Close")+'">'+iconsvg("close")+'</button></div>';
	if(weatherdata){
		html+='<div id="fcnow"><span class="fcnowicon">'+weathericonsvg(now.icon)+'</span>'+
			'<span class="fcnowtemp">'+Math.round(weatherdata.temp)+'°'+unit+'</span>'+
			'<span class="fcnowtext">'+now.text+
			(day?'<small>'+t("Today")+' '+Math.round(day.min)+'° / '+Math.round(day.max)+'°</small>':"")+
			'</span></div>';
	}
	if(hours.length){
		html+='<div id="fchours">'+hours.slice(0,FORECAST_PANEL_HOURS)
			.map((each) => fccell(each.h,each.code,each.isday,each.temp)).join("")+'</div>';
	} else {
		html+='<div class="sstatus">'+t("The forecast has not loaded yet.")+'</div>';
	}
	html+=weekhtml();
	fcpanel.innerHTML=html;
	document.getElementById("fcclose").addEventListener("click",closeforecast);
	// a manual refresh, for when you do not want to wait for the ten-minute timer
	document.getElementById("fcrefresh").addEventListener("click",async function(){
		this.classList.add("spinning");
		weatherdata=null;
		try { await fetchweather(); } catch(e) {}
		try { if(typeof fetchair==="function"){ await fetchair(); } } catch(e) {}
		renderforecastpanel();
	});
}

function openforecast(){
	if(!prefs.weatherShow || !weatherdata){ return; }
	renderforecastpanel();
	maindiv.classList.add("fcopen");
	if(typeof setfocus==="function"){ setfocus(document.getElementById("fcclose")); }
}

function closeforecast(){
	maindiv.classList.remove("fcopen");
	if(typeof setfocus==="function"){ setfocus(weather); }
}

(function(){
	// the widget itself is the button
	weather.addEventListener("click",function(){
		if(forecastopen()){ closeforecast(); } else { openforecast(); }
	});
	// ...which means the remote has to be able to land on it at home
	const contextelementswas=window.contextelements;
	window.contextelements=function(){
		if(forecastopen()){ return within(fcpanel,"button"); }
		const base=contextelementswas.apply(this,arguments);
		if(!realappbarbtu.checked && !settingsisopen() && prefs.weatherShow && isvisible(weather)){
			return [weather].concat(base);
		}
		return base;
	};
	// ...and Back has one more layer to peel off
	const handlebackwas=window.handleback;
	window.handleback=function(){
		if(forecastopen()){
			closeforecast();
			return;
		}
		return handlebackwas.apply(this,arguments);
	};
})();
