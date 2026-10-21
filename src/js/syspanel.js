//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// The status strip becomes a button: OK (or a click) on it opens a full system card. Exactly the
// way the weather widget opens the forecast panel - same plumbing, so the remote and Back behave
// the same in both.
//
// The strip up top can only afford a handful of numbers. This is where the rest lives: the network
// it is actually on, what the four cores and 1.5 GB of RAM are doing, where the 8 GB of internal
// storage went, whether the root setup is still intact after a firmware boot, and what the TV
// actually is.
//
// Everything comes from ONE root shell per open, in the same style status.js uses: print a marker
// line, then the command's output, and split on the markers afterwards. One process instead of
// fifteen is the difference between a panel that opens instantly and one that crawls.

let sypanel=null;
let sysdata=null;
let sysbusy=false;
const WAIT="···";      // stands in for a number the root shell has not answered with yet

function sysopen(){
	return maindiv.classList.contains("syopen");
}

// ---- the single gather. No '$' anywhere in here on purpose: execasroot hands the string to a
// shell, and shell expansion has bitten this project before.
const SYS_PROBE=[
	'echo @ping; ping -c 1 -W 2 8.8.8.8 2>/dev/null | tail -1',
	'echo @mem; grep -E "MemTotal|MemAvailable|SwapTotal|SwapFree" /proc/meminfo',
	'echo @load; cat /proc/loadavg',
	'echo @cores; grep -c ^processor /proc/cpuinfo',
	'echo @net; grep -E "wlan0|eth0" /proc/net/dev',
	'echo @ip; ip -4 addr show 2>/dev/null | grep "inet " | grep -v 127.0.0.1',
	'echo @dfint; df -k /mnt/lg/appstore 2>/dev/null | tail -1',
	'echo @dfvar; df -k /var 2>/dev/null | tail -1',
	'echo @dfusb; df -k /media/developer/wallpapers 2>/dev/null | tail -1',
	'echo @walls; ls /media/developer/wallpapers/ 2>/dev/null | grep -c "\\.jpg"',
	'echo @hosts; grep -c "su.lge.com" /etc/hosts',
	'echo @hb; tr "," "\\n" < /media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/appinfo.json 2>/dev/null | grep version',
	'echo @ssh; pgrep dropbear | wc -l',
	'echo @initd; ls /var/lib/webosbrew/init.d/ 2>/dev/null | wc -l',
	// The screen saver was turned off through the settings service, but LG gives that switch no
	// menu entry at all (its widget is "none" and the Standby Time list offers only 3/10/20/30
	// minutes). So the TV's own menu can never show whether it is off - this can.
	'echo @ss; luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettings \'{"category":"general","keys":["screenSaverEnabled"]}\' < /dev/null 2>/dev/null',
	'echo @dev; cat /var/run/nyx/device_info.json 2>/dev/null',
	'echo @os; cat /var/run/nyx/os_info.json 2>/dev/null',
	'echo @end; true'
].join('; ');

// "@mem\nMemTotal: 123 kB\n@load\n..." -> {mem:"MemTotal...", load:"..."}
function sysparts(text){
	const parts={};
	let key=null, buffer=[];
	String(text||"").split("\n").forEach((line) => {
		if(line.charAt(0)==="@"){
			if(key){ parts[key]=buffer.join("\n"); }
			key=line.slice(1).trim();
			buffer=[];
			return;
		}
		if(key){ buffer.push(line); }
	});
	if(key){ parts[key]=buffer.join("\n"); }
	return parts;
}

function jsonor(text,fallback){
	try { return JSON.parse(text); } catch(e) { return fallback; }
}

function kbfrom(text,field){
	const line=String(text||"").split("\n").find((each) => each.indexOf(field)===0);
	if(!line){ return null; }
	const value=parseInt(line.replace(/[^0-9]/g,""),10);
	return isFinite(value)?value:null;
}

// "/dev/mmcblk0p54 1509136 966920 525832 65% /mnt/..." -> {total,used,pct}
function dfline(text){
	const fields=String(text||"").trim().split(/\s+/);
	if(fields.length<5){ return null; }
	const total=parseInt(fields[1],10), used=parseInt(fields[2],10);
	if(!(total>0) || !isFinite(used)){ return null; }
	return {total:total,used:used,pct:Math.round(used/total*100)};
}

async function sysgather(){
	sysdata=sysdata || {};
	// the network name does not need root and is already polled by the status strip
	try { sysdata.net=statusdata.net || await lunacall('luna://com.webos.service.connectionmanager/getStatus',{}); } catch(e) {}
	if(typeof rooted==="undefined" || !rooted || typeof execasroot!=="function"){
		sysdata.noroot=true;
		return;
	}
	let out="";
	try {
		const r=await execasroot(SYS_PROBE);
		out=String((r && r.stdoutString) || "");
	} catch(e) { sysdata.failed=true; return; }
	const part=sysparts(out);
	sysdata.failed=false;
	sysdata.noroot=false;

	// --- latency: "rtt min/avg/max/mdev = 13.569/13.569/13.569/0.000 ms"
	const rtt=/=\s*[\d.]+\/([\d.]+)\//.exec(part.ping||"");
	sysdata.ping=rtt?parseFloat(rtt[1]):null;

	// --- memory and swap
	const memtotal=kbfrom(part.mem,"MemTotal"), memavail=kbfrom(part.mem,"MemAvailable");
	const swaptotal=kbfrom(part.mem,"SwapTotal"), swapfree=kbfrom(part.mem,"SwapFree");
	if(memtotal && memavail!==null){ sysdata.mem={total:memtotal,used:memtotal-memavail,pct:Math.round((memtotal-memavail)/memtotal*100)}; }
	if(swaptotal && swapfree!==null){ sysdata.swap={total:swaptotal,used:swaptotal-swapfree,pct:Math.round((swaptotal-swapfree)/swaptotal*100)}; }

	// --- cores and thread count. The load average is deliberately NOT shown: webOS idles at ~33
	// because of how many kernel threads sit in uninterruptible sleep, so it reads like a disaster
	// on a TV that is doing nothing. "7/1466" from the fourth field is the honest number.
	const loadfields=String(part.load||"").trim().split(/\s+/);
	sysdata.cores=parseInt(String(part.cores||"").trim(),10)||null;
	sysdata.procs=loadfields[3]||null;

	// --- bytes moved since the TV booted, over whichever interface is carrying traffic
	let rx=0,tx=0;
	String(part.net||"").split("\n").forEach((line) => {
		const bits=line.split(":");
		if(bits.length<2){ return; }
		const values=bits[1].trim().split(/\s+/).map(Number);
		if(values.length<9 || !isFinite(values[0])){ return; }
		if(values[0]>rx){ rx=values[0]; tx=values[8]; }
	});
	if(rx>0){ sysdata.rx=rx; sysdata.tx=tx; }

	// --- "inet 192.168.1.20/24 brd ..."
	const ip=/inet\s+([\d.]+)/.exec(part.ip||"");
	sysdata.ip=ip?ip[1]:null;

	// --- storage
	sysdata.internal=dfline(part.dfint);
	sysdata.varfs=dfline(part.dfvar);
	sysdata.usb=dfline(part.dfusb);
	sysdata.walls=parseInt(String(part.walls||"").trim(),10);

	// --- root health
	sysdata.updatesblocked=parseInt(String(part.hosts||"0").trim(),10)>0;
	const hb=/"version"\s*:\s*"([^"]+)"/.exec(part.hb||"");
	sysdata.hbversion=hb?hb[1]:null;
	sysdata.ssh=parseInt(String(part.ssh||"0").trim(),10)>0;
	sysdata.initd=parseInt(String(part.initd||"0").trim(),10);
	const saver=/"screenSaverEnabled"\s*:\s*"([^"]+)"/.exec(part.ss||"");
	sysdata.screensaver=saver?saver[1]:null;

	// --- what this TV is
	sysdata.device=jsonor(part.dev,null);
	sysdata.os=jsonor(part.os,null);
	sysdata.gathered=true;
}

// ---- small builders -------------------------------------------------------

function syrow(label,value,extra){
	return '<div class="syrow'+(extra?" "+extra:"")+'"><span class="sylabel">'+label+
		'</span><b class="syval">'+(value===null||value===undefined||value===""?"—":value)+'</b></div>';
}

// a labelled bar: the number on the right, the bar underneath, both on one row of the card
function sybar(label,percent,caption){
	const pct=Math.max(0,Math.min(100,isFinite(percent)?percent:0));
	const hot=pct>=90?" hot":(pct>=75?" warm":"");
	return '<div class="sybar'+hot+'">'+
		'<span class="sylabel">'+label+'</span>'+
		'<b class="syval">'+caption+'</b>'+
		'<span class="symeter"><i style="width:'+pct.toFixed(0)+'%"></i></span>'+
	'</div>';
}

// green tick when the thing is the way it should be, amber cross when it is not
function sypill(ok,text){
	return '<span class="sypill '+(ok?"good":"bad")+'">'+(ok?"✓":"✕")+' '+text+'</span>';
}

function sysec(title,body){
	return '<section class="sysec"><h4>'+title+'</h4>'+body+'</section>';
}

// 340480 kB -> "332 MB" / "1,4 GB"  (Serbian decimal comma)
function sysize(kbytes){
	if(!isFinite(kbytes)){ return "—"; }
	if(kbytes>=1024*1024){ return i18nnum(kbytes/1024/1024)+" GB"; }
	if(kbytes>=1024){ return Math.round(kbytes/1024)+" MB"; }
	return Math.round(kbytes)+" kB";
}

// raw byte counters from /proc/net/dev
function sytraffic(bytes){
	if(!isFinite(bytes)){ return "—"; }
	return sysize(bytes/1024);
}

// ---- the card -------------------------------------------------------------

function syshtml(){
	const d=sysdata || {};
	let html='<div id="syhead"><div id="sytitle">'+t("System")+'</div>'+
		'<button id="syrefresh" title="'+t("Refresh")+'" aria-label="'+t("Refresh")+'">'+iconsvg("reset")+'</button>'+
		'<button id="syclose" title="'+t("Close")+'" aria-label="'+t("Close")+'">'+iconsvg("close")+'</button></div>';

	if(d.noroot){
		return html+'<div class="sstatus">'+t("Without root the launcher cannot read system data.")+'</div>';
	}
	if(d.failed){
		return html+'<div class="sstatus">'+t("Reading system data failed.")+'</div>';
	}

	// ---- network
	const net=d.net || {};
	const wifi=net.wifi, wired=net.wired;
	let linkname=t("No network"), linkdetail=null;
	if(wired && wired.state==="connected"){
		linkname=t("Wired network");
		linkdetail=t("Ethernet");
	} else if(wifi && wifi.state==="connected"){
		linkname=String(wifi.ssid||"Wi-Fi");
		const band=Number(wifi.connectedFrequency)>=5000?"5 GHz":i18nnum(2.4)+" GHz";
		const dbm=parseFloat(statusdata.dbm);
		linkdetail=band+(isFinite(dbm)?" · "+Math.round(dbm)+" dBm":"");
	}
	const netbody=
		syrow(t("Network"),linkname)+
		syrow(t("Link"),linkdetail)+
		syrow(t("IP address"),d.ip)+
		syrow(t("Latency"),isFinite(d.ping)?i18nnum(d.ping)+" ms":
			(net.isInternetConnectionAvailable?"—":t("no internet")))+
		syrow(t("Since boot"),"↓ "+sytraffic(d.rx)+"  ↑ "+sytraffic(d.tx));

	// ---- hardware
	const cpu=statusdata.cpu;
	const temp=statusdata.temp;
	const hwbody=
		sybar(t("CPU"),cpu,(isFinite(cpu)?cpu+"%":WAIT)+(isFinite(temp)?" · "+temp+"°C":""))+
		sybar("RAM",d.mem?d.mem.pct:0,d.mem?sysize(d.mem.used)+" / "+sysize(d.mem.total):WAIT)+
		sybar(t("Swap"),d.swap?d.swap.pct:0,d.swap?sysize(d.swap.used)+" / "+sysize(d.swap.total):WAIT)+
		syrow(t("Cores"),d.cores)+
		syrow(t("Processes"),d.procs?d.procs.split("/")[0]+t(" active / ")+d.procs.split("/")[1]:null);

	// ---- storage
	const stbody=
		sybar(t("Internal"),d.internal?d.internal.pct:0,d.internal?sysize(d.internal.used)+" / "+sysize(d.internal.total):WAIT)+
		sybar(t("System"),d.varfs?d.varfs.pct:0,d.varfs?sysize(d.varfs.used)+" / "+sysize(d.varfs.total):WAIT)+
		sybar(t("USB disk"),d.usb?d.usb.pct:0,d.usb?sysize(d.usb.used)+" / "+sysize(d.usb.total):(d.gathered?t("not connected"):WAIT))+
		syrow(t("Wallpapers"),isFinite(d.walls)&&d.walls>0?d.walls+t(" photos")+" · "+sysize(d.usb?d.usb.used:NaN):null);

	// ---- root health. These five are what a firmware boot can quietly undo, so they are worth a
	// glance: if one goes red, the mods are not loading any more.
	const rootbody=!d.gathered?'<div class="sypills">'+sypill(true,t("Root active"))+'</div>':'<div class="sypills">'+
		sypill(true,t("Root active"))+
		sypill(d.updatesblocked,d.updatesblocked?t("LG updates blocked"):t("LG updates NOT blocked"))+
		sypill(!!d.hbversion,d.hbversion?"Homebrew "+d.hbversion:t("Homebrew unavailable"))+
		sypill(d.ssh,d.ssh?t("SSH running"):t("SSH not running"))+
		sypill(d.initd>0,d.initd>0?t("Startup scripts: ")+d.initd:t("No startup scripts"))+
		(d.screensaver?sypill(d.screensaver==="off",
			d.screensaver==="off"?t("Screen saver off"):t("Screen saver IS BACK")):"")+
	'</div>';

	// ---- the TV itself
	const dev=d.device || {}, os=d.os || {};
	const build=String(os.webos_build_datetime||"");
	const builddate=build.length>=8?build.slice(6,8)+"."+build.slice(4,6)+"."+build.slice(0,4)+".":null;
	const tvbody=
		syrow(t("Model"),dev.product_id)+
		syrow("webOS",(os.core_os_release||"")+(os.core_os_name?" · "+os.core_os_name:""))+
		syrow(t("Firmware"),builddate?("build "+os.webos_build_id+" · "+builddate):os.webos_build_id)+
		syrow(t("Kernel"),os.core_os_kernel_version)+
		syrow(t("Uptime"),isFinite(statusdata.uptime)?uptimetext(statusdata.uptime):"—");

	html+='<div class="sygrid">'+
		sysec(t("Network"),netbody)+
		sysec(t("Hardware"),hwbody)+
		sysec(t("Storage"),stbody)+
		sysec("TV",tvbody)+
	'</div>'+sysec(t("Root"),rootbody);
	return html;
}

function rendersyspanel(){
	if(!sypanel){
		sypanel=document.createElement("div");
		sypanel.id="sypanel";
		maindiv.appendChild(sypanel);
	}
	sypanel.innerHTML=syshtml();
	document.getElementById("syclose").addEventListener("click",closesys);
	document.getElementById("syrefresh").addEventListener("click",async function(){
		if(sysbusy){ return; }
		sysbusy=true;
		this.classList.add("spinning");
		try { await sysgather(); } catch(e) {}
		sysbusy=false;
		rendersyspanel();
		if(typeof setfocus==="function"){ setfocus(document.getElementById("syrefresh")); }
	});
}

async function opensys(){
	if(sysopen()){ return; }
	// paint immediately with whatever the status strip already knows, then fill in the rest
	rendersyspanel();
	maindiv.classList.add("syopen");
	if(typeof setfocus==="function"){ setfocus(document.getElementById("syclose")); }
	await sysgather();
	if(sysopen()){
		rendersyspanel();
		if(typeof setfocus==="function"){ setfocus(document.getElementById("syclose")); }
	}
}

function closesys(){
	maindiv.classList.remove("syopen");
	const strip=document.getElementById("statusbar");
	if(typeof setfocus==="function" && strip){ setfocus(strip); }
}

(function(){
	// Gather once a few seconds after launch, so the card is already full the first time it opens
	// instead of filling in under the user's eyes. `rooted` is still settling right after load,
	// which is why this waits rather than running at DOMContentLoaded.
	document.addEventListener("DOMContentLoaded",() => {
		setTimeout(() => { sysgather().catch(() => {}); },7000);
	});

	// The strip is built by status.js on its first render, which happens after this file runs - so
	// the click is delegated from #maindiv rather than bound to the element.
	maindiv.addEventListener("click",function(event){
		const strip=document.getElementById("statusbar");
		if(!strip || sysopen()){ return; }
		if(strip===event.target || strip.contains(event.target)){ opensys(); }
	});

	// ...and the remote has to be able to land on it at home, the same way it lands on the weather
	const contextelementswas=window.contextelements;
	window.contextelements=function(){
		if(sysopen()){ return within(sypanel,"button"); }
		const base=contextelementswas.apply(this,arguments);
		const strip=document.getElementById("statusbar");
		if(strip && !realappbarbtu.checked && !settingsisopen() &&
			(typeof forecastopen!=="function" || !forecastopen()) && isvisible(strip)){
			return [strip].concat(base);
		}
		return base;
	};

	// ...and Back peels this layer off too
	const handlebackwas=window.handleback;
	window.handleback=function(){
		if(sysopen()){
			closesys();
			return;
		}
		return handlebackwas.apply(this,arguments);
	};
})();
