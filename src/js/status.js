//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// The status strip in the top-right corner: Wi-Fi, live network throughput, CPU (with the panel
// temperature), memory and app storage. The clock owns the top-left, so this fills the other side.
//
// Where the numbers come from (one root shell per poll, so the gauges need root; the network name
// comes from a plain luna call and still works without it):
//   network name/band  luna://com.webos.service.connectionmanager/getStatus
//   signal             /proc/net/wireless      throughput  /proc/net/dev   (counters, so deltas)
//   cpu                /proc/stat              (idle vs total between two samples)
//   temperature        /sys/class/thermal/thermal_zone0/temp
//   memory             free -m                 storage     df -k /mnt/lg/appstore

const TEMP_WARN=80;               // °C: above this the CPU field turns red
const STATUS_FAST_MS=1000;        // cpu, throughput and signal move every second
const STATUS_SLOW_MS=60*1000;     // the disk barely does
let statusbar=null;
let statusdata={};
let cpuprev=null;                 // {idle,total} from the last sample
let netprev=null;                 // {rx,tx,at}

function statusel(tag,cls,text){
	const e=document.createElement(tag);
	if(cls){ e.className=cls; }
	if(text!==undefined){ e.textContent=text; }
	return e;
}

// four arcs, lit according to how strong the signal is
function signalsvg(bars){
	const arc=(i,d) => '<path d="'+d+'" fill="none" stroke="'+(i<=bars?"currentColor":"rgba(255,255,255,0.25)")+
		'" stroke-width="7" stroke-linecap="round"/>';
	return '<svg viewBox="0 0 64 64" aria-hidden="true">'+
		arc(1,"M26 46a9 9 0 0 1 12 0")+
		arc(2,"M18 36a21 21 0 0 1 28 0")+
		arc(3,"M11 26a32 32 0 0 1 42 0")+
		arc(4,"M4 16a44 44 0 0 1 56 0")+
	'</svg>';
}

function wiredsvg(){
	return '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="18" width="48" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="6"/><path d="M20 48v6M44 48v6" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>';
}

// -50 dBm and up is full; below -80 is one bar
function barsfor(dbm){
	if(!isFinite(dbm)){ return 4; }
	if(dbm>=-50){ return 4; }
	if(dbm>=-60){ return 3; }
	if(dbm>=-70){ return 2; }
	return 1;
}

function gauge(name,percent,caption){
	const box=statusel("div","stgauge"+(percent>=90?" hot":""));
	box.appendChild(statusel("small","stname",name));
	const meter=statusel("div","stmeter");
	const fill=statusel("i");
	fill.style.width=Math.max(0,Math.min(100,percent))+"%";
	meter.appendChild(fill);
	box.appendChild(meter);
	box.appendChild(statusel("b","stvalue",caption));
	return box;
}

// 1536 -> "1.5 KB/s", 1572864 -> "1.5 MB/s"
function rate(bytespersecond){
	if(!isFinite(bytespersecond) || bytespersecond<0){ bytespersecond=0; }
	if(bytespersecond>=1024*1024){ return i18nnum(bytespersecond/1024/1024)+" MB/s"; }
	if(bytespersecond>=1024){ return Math.round(bytespersecond/1024)+" KB/s"; }
	return Math.round(bytespersecond)+" B/s";
}

// 6037 -> "1 h 40 min"
function uptimetext(seconds){
	const days=Math.floor(seconds/86400);
	const hours=Math.floor(seconds%86400/3600);
	const minutes=Math.floor(seconds%3600/60);
	if(days>0){ return days+" d "+hours+" h"; }
	if(hours>0){ return hours+" h "+minutes+" min"; }
	return minutes+" min";
}

// "958336" (kB) -> "0.9 GB"
function gb(kbytes){
	const value=kbytes/1024/1024;
	return (value>=10?String(Math.round(value)):i18nnum(value))+" GB";
}

function renderstatus(){
	if(!statusbar){
		statusbar=statusel("div");
		statusbar.id="statusbar";
		maindiv.appendChild(statusbar);
	}
	statusbar.innerHTML="";
	// ---- network name and signal
	const net=statusdata.net;
	const wifi=net && net.wifi;
	const wired=net && net.wired;
	const online=net && net.isInternetConnectionAvailable;
	const link=statusel("div","stlink");
	const icon=statusel("span","sticon");
	const text=statusel("span","sttext");
	if(wired && wired.state==="connected"){
		icon.innerHTML=wiredsvg();
		text.appendChild(statusel("b",null,t("Wired network")));
		text.appendChild(statusel("small",null,online?t("Connected"):t("No internet")));
	} else if(wifi && wifi.state==="connected"){
		const dbm=parseFloat(statusdata.dbm);
		icon.innerHTML=signalsvg(barsfor(dbm));
		text.appendChild(statusel("b",null,String(wifi.ssid||"Wi-Fi").slice(0,18)));
		const band=Number(wifi.connectedFrequency)>=5000?"5 GHz":i18nnum(2.4)+" GHz";
		text.appendChild(statusel("small",null,band+(isFinite(dbm)?" · "+Math.round(dbm)+" dBm":"")));
	} else {
		icon.innerHTML=signalsvg(0);
		text.appendChild(statusel("b",null,t("No network")));
		text.appendChild(statusel("small",null,t("Not connected")));
	}
	link.appendChild(icon);
	link.appendChild(text);
	statusbar.appendChild(link);
	// ---- throughput (needs two samples, so it appears a few seconds in)
	if(statusdata.down!==undefined){
		statusbar.appendChild(statusel("div","stsep"));
		const flow=statusel("div","stflow");
		const down=statusel("span","stdown");
		down.appendChild(statusel("i",null,"↓"));
		down.appendChild(statusel("span",null,rate(statusdata.down)));
		const up=statusel("span","stup");
		up.appendChild(statusel("i",null,"↑"));
		up.appendChild(statusel("span",null,rate(statusdata.up)));
		flow.appendChild(down);
		flow.appendChild(up);
		statusbar.appendChild(flow);
	}
	// ---- gauges (root only)
	if(statusdata.cpu!==undefined){
		statusbar.appendChild(statusel("div","stsep"));
		const caption=statusdata.cpu+"%"+(statusdata.temp!==undefined?" · "+statusdata.temp+"°C":"");
		const box=gauge("CPU",statusdata.cpu,caption);
		// a panel that gets this warm is worth noticing
		if(statusdata.temp!==undefined && statusdata.temp>=TEMP_WARN){ box.classList.add("hot"); }
		statusbar.appendChild(box);
	}
	if(statusdata.rampct!==undefined){
		statusbar.appendChild(statusel("div","stsep"));
		statusbar.appendChild(gauge("RAM",statusdata.rampct,statusdata.rampct+"%"));
	}
	if(statusdata.diskpct!==undefined){
		statusbar.appendChild(statusel("div","stsep"));
		statusbar.appendChild(gauge(t("Storage"),statusdata.diskpct,gb(statusdata.diskused)+" / "+gb(statusdata.disktotal)));
	}
	if(statusdata.uptime!==undefined){
		statusbar.appendChild(statusel("div","stsep"));
		const box=statusel("div","stmini");
		box.appendChild(statusel("small","stname",t("Uptime")));
		box.appendChild(statusel("b","stvalue",uptimetext(statusdata.uptime)));
		statusbar.appendChild(box);
	}
}

function hasroot(){
	return typeof rooted!=="undefined" && rooted && typeof execasroot==="function";
}

// Everything that changes second to second, in ONE process: `grep -H .` prints every line
// prefixed with its own file, so the answer parses without ambiguity. Measured at ~46 ms, which
// is what makes a one-second refresh reasonable instead of a shell storm.
const FAST_FILES="/proc/stat /proc/uptime /proc/net/dev /proc/net/wireless /proc/meminfo /sys/class/thermal/thermal_zone0/temp";
const FAST_WANT="stat:cpu |uptime|dev:.*(wlan0|eth0)|wireless:.*wlan0|MemTotal|MemAvailable|temp:";

async function readfast(){
	if(!hasroot()){ return; }
	let out="";
	try {
		const r=await execasroot("grep -H . "+FAST_FILES+" 2>/dev/null | grep -E '"+FAST_WANT+"'");
		out=String((r && r.stdoutString) || "");
	} catch(e) { return; }
	const now=Date.now();
	let memtotal=0,memavail=0,rx=null,tx=null;
	out.split("\n").forEach((line) => {
		const cut=line.indexOf(":");
		if(cut===-1){ return; }
		const file=line.slice(0,cut);
		const body=line.slice(cut+1);
		if(file==="/proc/stat"){
			// busy share of the time that passed since the previous sample
			const cpu=body.trim().split(/\s+/).slice(1).map(Number).filter((n) => isFinite(n));
			if(cpu.length<5){ return; }
			const total=cpu.reduce((a,b) => a+b,0);
			const idle=cpu[3]+cpu[4];
			if(cpuprev && total>cpuprev.total){
				const busy=(total-cpuprev.total)-(idle-cpuprev.idle);
				statusdata.cpu=Math.max(0,Math.min(100,Math.round(busy/(total-cpuprev.total)*100)));
			}
			cpuprev={idle:idle,total:total};
		} else if(file==="/proc/uptime"){
			const seconds=parseFloat(body);
			if(isFinite(seconds)){ statusdata.uptime=seconds; }
		} else if(file==="/proc/net/dev"){
			// "<iface>: <rx bytes> ... <tx bytes at index 8>"
			const bits=body.split(":");
			if(bits.length<2){ return; }
			const values=bits[1].trim().split(/\s+/).map(Number);
			if(values.length<9 || !isFinite(values[0])){ return; }
			if(rx===null || values[0]>rx){ rx=values[0]; tx=values[8]; }
		} else if(file==="/proc/net/wireless"){
			const values=body.split(":")[1];
			if(values===undefined){ return; }
			const fields=values.trim().split(/\s+/);
			if(fields.length>=3){ statusdata.dbm=parseFloat(fields[2]); }
		} else if(file==="/proc/meminfo"){
			const value=parseInt(body.replace(/[^0-9]/g,""),10);
			if(body.indexOf("MemTotal")===0){ memtotal=value; }
			else if(body.indexOf("MemAvailable")===0){ memavail=value; }
		} else {
			const temp=parseInt(body.trim(),10);
			if(isFinite(temp) && temp>0){ statusdata.temp=Math.round(temp>1000?temp/1000:temp); }
		}
	});
	if(memtotal>0 && memavail>0){ statusdata.rampct=Math.round((memtotal-memavail)/memtotal*100); }
	if(rx!==null){
		// /proc/net/dev counts bytes, so a rate is the difference over the time between samples
		if(netprev && now>netprev.at && rx>=netprev.rx){
			const seconds=(now-netprev.at)/1000;
			statusdata.down=(rx-netprev.rx)/seconds;
			statusdata.up=(tx-netprev.tx)/seconds;
		}
		netprev={rx:rx,tx:tx,at:now};
	}
}

async function readslow(){
	if(!hasroot()){ return; }
	try {
		const r=await execasroot("df -k /mnt/lg/appstore 2>/dev/null | tail -1");
		const disk=String((r && r.stdoutString) || "").trim().split(/\s+/);
		if(disk.length>=5){
			const total=parseInt(disk[1],10), used=parseInt(disk[2],10);
			if(total>0){
				statusdata.disktotal=total;
				statusdata.diskused=used;
				statusdata.diskpct=Math.round(used/total*100);
			}
		}
	} catch(e) {}
}

async function readnetname(){
	try {
		statusdata.net=await lunacall('luna://com.webos.service.connectionmanager/getStatus',{});
	} catch(e) {}
}

async function refreshstatus(full){
	if(full){ await readnetname(); }
	await readfast();
	if(full){ await readslow(); }
	renderstatus();
}

function initstatus(){
	refreshstatus(true);
	// `rooted` and the network are still settling right after launch; these catch up
	[2500,6000,15000].forEach((ms) => setTimeout(() => refreshstatus(true),ms));
	setInterval(() => { if(!document.hidden){ refreshstatus(false); } },STATUS_FAST_MS);
	setInterval(() => { if(!document.hidden){ refreshstatus(true); } },STATUS_SLOW_MS);
	document.addEventListener("visibilitychange",() => { if(!document.hidden){ refreshstatus(true); } });
}

document.addEventListener("DOMContentLoaded",initstatus);
