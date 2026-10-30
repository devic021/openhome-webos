//SPDX-License-Identifier: WTFNMFPL
// Settings: the schema below describes every setting, and the panel, saving and defaults are all generated from it.
//
// To add a setting:
//   1. add an item to a section in SETTINGS_SCHEMA (or add a whole section, it becomes a tab)
//   2. make applyprefs() react to its `key` (a CSS variable, a class on #maindiv, ...)
//
// Item fields:
//   key      name in `prefs` (saved in localStorage)      default   value used until the user changes it
//   label    text shown in the panel                      hint      optional small text under the label
//   type     "choice"   a row of buttons, `options` is a list of [value, label]
//            "swatch"   a row of colour dots, `options` is a list of [value, label], value is "r,g,b"
//            "position" a 3x3 grid of screen positions ("top-left" ... "bottom-right"); withClock adds "with-clock"
//            "slider"   a range: `min`, `max`, `step` and `unit` (text after the value, like "%"); the value is a number
//            "action"   one button (`button` is its text) that calls run(); add `confirm` (a question) and `confirmButton`
//                       to ask "are you sure?" first, with a Cancel
//            "custom"   draws itself: render(box, item) fills `box`. Give it a `key` too if it stores a value, plus
//                       `valid(value)` so a bad saved value is ignored. `wide: true` puts the control under the label.
//            "heading"  just `label`: a small title that starts a group of rows (no key, nothing saved)
//   show     optional function(prefs) returning false to hide the row while it doesn't apply
//
// A row with `wide: true` is laid out stacked (its control under the label). A `hint` is shown in the strip
// under the panel while its row has the focus. More item fields: `stepper: true` (a choice drawn as < value >), `compact: true`
// (short buttons), `cards: true` (big buttons; an option may have a third entry, an icon name), `icon` on an action.
// Sections have an `icon` (shown on the tab); src/js/preview.js draws the live preview beside some tabs.
// Picking a "position" fades the panel for a moment (peek()) so the change can be seen behind it.

const PREFS_KEY='openlauncher.prefs';

const ON_OFF=[[true,t("On")],[false,t("Off")]];      // drawn as a switch
const SIZE_OPTIONS=(small,medium,large,extra) => [[small,"S"],[medium,"M"],[large,"L"],[extra,"XL"]];
const RECENT_SCALE=0.78;      // the Recent row's tiles, as a share of a bottom-bar tile, so the dock stays the hero

const SETTINGS_SCHEMA=[
	{id:"clock",title:t("Clock"),icon:"clock",items:[
		{key:"clockStyle",label:t("Style"),type:"choice",stepper:true,default:"digital",options:[["digital",t("Digital")],["stacked",t("Stacked")],["analog",t("Analogue")],["analogmin",t("Analogue minimal")],["off",t("Off")]]},
		{key:"clockSeconds",label:t("Seconds"),type:"choice",default:true,options:ON_OFF,show:(p) => p.clockStyle!=="off"},
		{key:"clockHour12",label:t("Hours"),type:"choice",default:false,options:[[false,t("24-hour")],[true,t("12-hour")]],show:(p) => p.clockStyle==="digital" || p.clockStyle==="stacked"},
		{key:"clockPos",label:t("Position"),type:"position",default:"top-left"},
		{type:"heading",label:t("Look")},
		{key:"look",label:t("Look"),type:"choice",stepper:true,default:"editorial",
			options:[["editorial",t("Editorial")],["classic",t("Classic")]],
			hint:t("Editorial takes the panels away: the dock has no bar, the clock is large and thin, the inputs stand down the left edge and the drawer becomes one layer over a dimmed picture. Classic is the original appearance.")}
	]},
	{id:"date",title:t("Date"),icon:"calendar",items:[
		{key:"dateShow",label:t("Date"),type:"choice",default:true,options:ON_OFF,hint:t("Turn off both Date and Weekday to hide it completely")},
		{key:"dateFormat",label:t("Format"),type:"choice",stepper:true,default:"ymd-slash",show:(p) => p.dateShow,options:[
			["ymd-slash","YYYY/MM/DD"],["dmy-slash","DD/MM/YYYY"],["mdy-slash","MM/DD/YYYY"],["dmy-dash","DD-MM-YYYY"],["dmy-dot","DD.MM.YYYY"],["dmy-colon","DD:MM:YYYY"],
			["d-month-y",t("DD Month YYYY")],["month-d-y",t("Month DD, YYYY")],["d-mon-y",t("DD Mon YYYY")]]},
		{key:"dayStyle",label:t("Weekday"),type:"choice",default:"off",options:[["off",t("Off")],["short",t("Short")],["long",t("Full")]]},
		{key:"dayPos",label:t("Weekday goes"),type:"choice",default:"before",options:[["before",t("Before the date")],["after",t("After the date")]],show:(p) => p.dateShow && p.dayStyle!=="off"},
		{key:"datePos",label:t("Position"),type:"position",default:"with-clock",withClock:true,show:(p) => p.dateShow || p.dayStyle!=="off"}
	]},
	{id:"weather",title:t("Weather"),icon:"partday",items:[
		{key:"weatherShow",label:t("Weather"),type:"choice",default:true,options:ON_OFF,hint:t("Current weather from Open-Meteo (needs the internet)")},
		{key:"weatherPlace",label:t("Location"),type:"custom",wide:true,default:null,show:(p) => p.weatherShow,
			valid:(v) => v===null || (!!v && typeof v.name==="string" && typeof v.lat==="number" && typeof v.lon==="number"),
			render:(box) => renderweatherplace(box)},
		{key:"weatherUnit",label:t("Temperature"),type:"choice",default:"c",options:[["c","\u00b0C"],["f","\u00b0F"]],show:(p) => p.weatherShow},
		{key:"weatherPos",label:t("Position"),type:"position",default:"with-clock",withClock:true,show:(p) => p.weatherShow}
	]},
	{id:"apps",title:t("Apps"),icon:"apps",items:[
		{type:"action",label:t("Edit home screen"),button:t("Open"),icon:"pencil",
			hint:t("Opens the app menu in Edit mode. That is where you reorder icons, rename them, make folders and choose what sits on the bottom bar: pick an app and press OK."),
			run:() => openeditmode()},
		{type:"heading",label:t("Bottom bar")},
		{key:"barPerPage",compact:true,label:t("Icons per page"),type:"choice",default:14,options:[[10,"10"],[12,"12"],[14,"14"],[16,"16"]],
			hint:t("How many icons fit on one page of the bottom bar, counting the Apps button. Fewer means bigger icons. With more apps than that, the arrow at the end of the bar turns to the next page.")},
		{key:"barNames",label:t("Names"),type:"choice",default:true,options:ON_OFF},
		{key:"barNameSize",compact:true,label:t("Name size"),type:"choice",default:1.5,options:SIZE_OPTIONS(1.2,1.5,1.9,2.3),show:(p) => p.barNames},
		{type:"heading",label:t("App menu")},
		{key:"menuSize",compact:true,label:t("Size"),type:"choice",default:6,options:SIZE_OPTIONS(6,7.5,9,11)},
		{key:"menuOpacity",label:t("Wallpaper"),type:"slider",default:50,min:0,max:100,step:5,unit:"%",hint:t("How dark the app menu's background is. 0% shows the wallpaper through it, 100% hides it.")},
		{key:"showSystemApps",label:t("System apps"),type:"choice",default:false,options:ON_OFF,hint:t("The TV marks its inputs, services and helper apps as not meant for an app list, so they are left out. Turn this on to show them anyway.")},
		{key:"hidePinned",label:t("Hide pinned"),type:"choice",default:false,options:ON_OFF,hint:t("Leave the apps that are on the bottom bar out of the app menu, so each app shows once. Edit mode still shows them, so you can move or unpin them.")},
		{key:"menuNames",label:t("Names"),type:"choice",default:true,options:ON_OFF},
		{key:"menuNameSize",compact:true,label:t("Name size"),type:"choice",default:1.5,options:SIZE_OPTIONS(1.2,1.5,1.9,2.3),show:(p) => p.menuNames},
		{label:t("Folders"),type:"custom",wide:true,render:(box) => renderfolderlist(box),
			hint:t("Group apps in the app menu. In Edit mode, an app's folder button puts it in a folder.")},
		{type:"heading",label:t("Recent apps")},
		{key:"recentShow",label:t("Show"),type:"choice",default:false,options:ON_OFF,hint:t("A row of the apps you opened last, above the bottom bar")},
		{key:"recentCount",label:t("How many"),type:"choice",default:5,options:[[3,"3"],[5,"5"],[7,"7"],[9,"9"]],show:(p) => p.recentShow},
		{type:"heading",label:t("Colour")},
		{key:"accent",label:t("Focus colour"),type:"swatch",default:"80,220,230",options:[
			["255,150,255",t("Pink")],["255,90,90",t("Red")],["255,160,60",t("Orange")],["255,215,80",t("Yellow")],["110,220,120",t("Green")],
			["80,220,230",t("Cyan")],["90,170,255",t("Blue")],["170,120,255",t("Purple")],["255,255,255",t("White")]]}
	]},
	{id:"wallpaper",title:t("Wallpaper"),icon:"wallpaper",items:[
		{key:"videoSource",label:t("Wallpaper source"),type:"choice",default:"online",cards:true,options:[["photos",t("Photos"),"wallpaper"],["online",t("Online"),"cloud"],["offline",t("Built in"),"drive"],["custom",t("Mine"),"photo"]],
			hint:t("Photos are pictures from Wikimedia Commons and use about 36 MB per hour. Online streams video and uses about 2.7 GB per hour. Built in plays the video bundled with the launcher, and Mine plays the links you add below.")},
		{label:t("Video sources"),type:"custom",wide:true,show:(p) => p.videoSource==="online",
			hint:t("Where the videos come from and how many there are per source. The list is from couchy-launcher; the videos stay on their own servers."),
			render:(box) => rendersources(box)},
		{key:"customUrls",label:t("My wallpapers"),type:"custom",wide:true,default:[],show:(p) => p.videoSource==="custom",
			hint:t("Links to videos (.mp4 .mov .mkv .webm) and photos (.jpg .png .webp). They play in random order."),
			valid:(v) => Array.isArray(v) && v.length<=CUSTOM_MAX && v.every(validcustomurl),
			render:(box) => renderwallpaperlist(box)},
		{type:"action",label:t("Fetch new photos"),button:t("Fetch"),icon:"download",show:(p) => p.videoSource==="photos",
			hint:t("Fetches a completely new set of photos from Wikimedia Commons right away and deletes the old ones. Takes a couple of minutes and about 150 MB."),
			run:() => poolrenew()},
		{label:t("Photos on the TV"),type:"custom",wide:true,nolabel:true,show:(p) => p.videoSource==="photos",
			render:(box) => box.appendChild(el("div","sstatus",typeof poolbusytext==="function"?poolbusytext():""))},
		{key:"photoRefresh",label:t("Photo refresh"),type:"choice",default:"daily",show:(p) => p.videoSource==="photos",
			options:[["off",t("Off")],["daily",t("Daily")],["cycle",t("Every cycle")]],
			hint:t("Photos are kept on the TV, so they appear instantly and work with the internet down. Off uses nothing and keeps the same pictures. Daily turns the whole pool over once a day (~7 MB/h). Every cycle brings a new picture for every picture shown (~78 MB/h, the same as streaming).")},
		{key:"customSeconds",label:t("Photo duration"),type:"choice",default:60,options:[[20,"20 s"],[30,"30 s"],[60,"1 min"],[120,"2 min"]],show:(p) => p.videoSource==="custom" || p.videoSource==="photos"}
	]},
	{id:"screen",title:t("Screen"),icon:"monitor",items:[
		{key:"statusShow",label:t("Status strip"),type:"choice",default:"full",
			options:[["full",t("Full")],["compact",t("Icon only")],["off",t("Off")]],
			hint:t("The panel in the top corner with the network, CPU, memory and storage. Off removes it and stops the once-a-second reading behind it as well.")},
		{type:"action",label:t("System panel"),button:t("Open"),icon:"info",show:(p) => p.statusShow==="off",
			hint:t("The strip is how the system panel normally opens, so here is the way in while it is off."),
			run:() => { closesettings(); opensys(); }},
		{key:"pixelShift",label:t("Pixel shift"),type:"choice",default:0,options:[[0,t("Off")],[1,t("Small")],[2,t("Large")]],
			hint:t("Nudges the clock, bar and buttons a few pixels every minute so an OLED screen doesn't keep the same pixels lit")},
		{key:"idleAfter",label:t("Idle after"),type:"choice",default:0,options:[[0,t("Never")],[1,"1 min"],[2,"2 min"],[5,"5 min"],[10,"10 min"]],
			hint:t("After this long with no pointer or button input")},
		{key:"idleAction",label:t("Then"),type:"choice",default:"dim",options:[["dim",t("Dim everything")],["hidebar",t("Hide the bar")]],hint:t("Dim everything dims the whole screen. Hide the bar also hides the bottom bar and dims the rest."),show:(p) => p.idleAfter>0},
		{key:"idleDim",label:t("Dim level"),type:"slider",default:30,min:5,max:100,step:5,unit:"%",show:(p) => p.idleAfter>0,
			hint:t("How bright the clock, bar and buttons stay when idle. Lower is darker. The small screen beside shows it.")}
	]},
	{id:"backup",title:t("Backup"),icon:"save",items:[
		{label:t("Settings backup"),type:"custom",wide:true,hint:t("Export settings and the app layout as JSON, or import a backup back in."),render:(box,item) => renderbackup(box,item)}
	]},
	{id:"tv",title:"TV",icon:"tv",items:[
		{type:"action",label:t("TV settings"),hint:t("Opens the TV's own settings"),button:t("Open"),icon:"open",run:() => launchapp("com.palm.app.settings")},
		{type:"action",label:t("Reset launcher"),hint:t("Resets every setting to its default"),button:t("Reset"),icon:"reset",confirm:t("Are you sure?"),confirmButton:t("Yes, reset"),run:() => resetprefs()},
		{type:"heading",label:t("Replace stock Home"),show:(p) => rooted},
		{key:"homeReplaceMethod",label:t("webOS version"),type:"choice",stepper:true,default:"sixto24",show:(p) => rooted,
			options:[["sixto24","6-24"],["twentyfive","25"],["defaultapp","25-26"],["copilot","25-26 (copilot)"]],
			hint:t("Auto-detected from a system file when you open this tab, so it is usually already right - but it only tells 6-24 from 25+, not 25 from 25-26, so check About > Firmware (or the TV's Settings > Support > About This TV) if Apply does nothing. A wrong choice simply does nothing; you do not have to undo it before trying another.")},
		{type:"action",label:t("Bind Home + auto-start"),button:t("Apply"),icon:"open",show:(p) => rooted,
			confirm:t("This changes a system file (or sets the default Home app) for the chosen version and restarts the system UI. Continue?"),confirmButton:t("Yes, apply"),
			run:() => applyhomereplace()},
		{type:"action",label:t("Restore stock Home"),hint:t("Undoes Bind Home + auto-start (any version). Do this before uninstalling - uninstalling on its own does not restore the stock Home."),
			button:t("Restore"),icon:"reset",show:(p) => rooted,
			confirm:t("This restores the stock Home screen and restarts the system UI. Continue?"),confirmButton:t("Yes, restore"),
			run:() => restorehome()},
		{label:t("Result"),type:"custom",wide:true,nolabel:true,show:(p) => rooted,render:(box) => renderhomereplace(box)},
		{label:t("Replace stock Home"),type:"custom",wide:true,nolabel:true,show:(p) => !rooted,
			render:(box) => box.appendChild(el("div","sstatus",t("Root required (Homebrew Channel). See the Replace section in the Readme to do it by hand over SSH.")))}
	]},
	{id:"about",title:t("About"),icon:"info",items:[
		{label:t("About"),type:"custom",wide:true,nolabel:true,render:(box) => renderabout(box)},
		{type:"heading",label:t("Uninstall"),show:(p) => turstedapp || rooted},
		{type:"action",label:t("Uninstall launcher"),button:t("Uninstall"),icon:"trash",show:(p) => turstedapp || rooted,
			confirm:t("This uninstalls the launcher (and restores the stock Home screen first, if it was replaced). Continue?"),confirmButton:t("Yes, uninstall"),
			run:() => selfuninstall()},
		{label:t("Uninstall result"),type:"custom",wide:true,nolabel:true,show:(p) => turstedapp || rooted,render:(box) => renderuninstall(box)}
	]}
];

const PREF_DEFAULTS={};
SETTINGS_SCHEMA.forEach((section) => section.items.forEach((item) => {
	if(item.key){ PREF_DEFAULTS[item.key]=item.default; }
}));

let prefs=Object.assign({},PREF_DEFAULTS);
let settingstab=SETTINGS_SCHEMA[0].id;
let confirming=null;   // the action item waiting for "are you sure?"

const POSITION_RE=/^(top|center|bottom)-(left|center|right)$/;

// a saved value only counts if the schema still offers it
function validpref(item,value){
	if(item.valid){
		return item.valid(value)===true;
	}
	if(item.type==="position"){
		return POSITION_RE.test(value) || (item.withClock===true && value==="with-clock");
	}
	if(item.type==="slider"){
		return typeof value==="number" && isFinite(value) && value>=item.min && value<=item.max && (value-item.min)%item.step===0;
	}
	if(item.options){
		return item.options.some((option) => option[0]===value);
	}
	return false;
}

function loadprefs(){
	prefs=Object.assign({},PREF_DEFAULTS);
	try {
		const saved=JSON.parse(localStorage.getItem(PREFS_KEY));
		if(saved){
			SETTINGS_SCHEMA.forEach((section) => section.items.forEach((item) => {
				if(item.key && (item.key in saved) && validpref(item,saved[item.key])){ prefs[item.key]=saved[item.key]; }
			}));
		}
	} catch(e) {}
}

// only what differs from the defaults is stored, so new defaults reach people who never changed a setting
function changedprefs(){
	const changed={};
	for(const key in prefs){
		if(JSON.stringify(prefs[key])!==JSON.stringify(PREF_DEFAULTS[key])){ changed[key]=prefs[key]; }
	}
	return changed;
}

function saveprefs(){
	try {
		localStorage.setItem(PREFS_KEY,JSON.stringify(changedprefs()));
	} catch(e) {}
}

function setpref(key,value){
	prefs[key]=value;
	saveprefs();
	applyprefs();
	renderpane();
}

// a value that changes while a slider is being dragged: no redrawing of the panel, which would drop the slider
function setprefquiet(key,value){
	prefs[key]=value;
	saveprefs();
	applysizes();
	renderpreview();
}

function resetprefs(){
	prefs=Object.assign({},PREF_DEFAULTS);
	saveprefs();
	applyprefs();
	renderpane();
}

// CSS variables that depend on the prefs and on the screen shape; also run when the window is resized
function applysizes(){
	const root=document.documentElement.style;
	root.setProperty("--accent",prefs.accent);
	// the bar is exactly `barPerPage` columns wide, so the tile size follows from how many share a page
	const bartile=Math.round((98/(prefs.barPerPage||10))*100)/100;
	const recenttile=Math.round(bartile*RECENT_SCALE*100)/100;
	root.setProperty("--bartile",bartile+"vw");
	root.setProperty("--recenttile",recenttile+"vw");
	root.setProperty("--menutile",prefs.menuSize+"vw");
	root.setProperty("--menuopacity",String(prefs.menuOpacity/100));
	root.setProperty("--idledim",String(prefs.idleDim/100));
	root.setProperty("--barname",prefs.barNameSize+"vh");
	root.setProperty("--menuname",prefs.menuNameSize+"vh");
	// Sizes below are estimates in vh/vw of what a tile needs: a tile is about as tall as it is wide, plus its name
	// (about 3.35x the name's font size once margins are counted). vw -> vh goes through the aspect ratio.
	// A TV can report a 0x0 window while starting up, so fall back to 16:9 instead of dividing by zero.
	const aspect=(window.innerWidth>0 && window.innerHeight>0)?window.innerWidth/window.innerHeight:16/9;
	const namesvh=(names,size) => names?size*3.35:0;
	// the bar grows with its tiles
	const barheight=Math.max(15,bartile*aspect*1.05+namesvh(prefs.barNames,prefs.barNameSize));
	root.setProperty("--barh",(Math.round(barheight*10)/10)+"vh");
	// the app menu's grid rows are normally 2x a tile's width tall; bigger names need more, no names need less
	const rowfor=(tile,names,size) => names?Math.max(2,Math.round((1+namesvh(true,size)/aspect/tile+0.43)*100)/100):1.5;
	// the recent-apps row is a row of bar-sized tiles sitting above the bar
	root.setProperty("--recenth",(Math.round((recenttile*aspect*1.05+namesvh(prefs.barNames,prefs.barNameSize))*10)/10)+"vh");
	root.setProperty("--menurow",String(rowfor(prefs.menuSize,prefs.menuNames,prefs.menuNameSize)));
}

// make the launcher match `prefs`
function applyprefs(){
	// one class, and the whole editorial.css sheet switches on or off
	document.documentElement.classList.toggle("look-editorial",prefs.look==="editorial");
	applysizes();
	maindiv.classList.toggle("hide-bar-names",!prefs.barNames);
	maindiv.classList.toggle("hide-menu-names",!prefs.menuNames);
	applyclock(prefs);
	render();
	applybackgroundsource();
	renderrecent();
	applyscreen();
	applyweather();
	if(typeof applystatus==="function"){ applystatus(); }
}

// ---- panel

function el(tag,cls,text){
	const e=document.createElement(tag);
	if(cls){ e.className=cls; }
	if(text!==undefined){ e.textContent=text; }
	return e;
}

// the icon goes before the label (CSS order), the label stays the button's own text
function optionbutton(label,selected,onclick,icon){
	const btn=el("button","sopt"+(selected?" on":""),label);
	if(icon){
		const picture=el("span","sicon");
		picture.innerHTML=iconsvg(icon);
		btn.appendChild(picture);
		btn.classList.add("withicon");
	}
	btn.addEventListener("click",onclick);
	return btn;
}

// a button that is only a picture
function iconbutton(icon,title,onclick){
	const btn=el("button","sopt sicononly");
	btn.innerHTML=iconsvg(icon);
	btn.setAttribute("title",title);
	btn.setAttribute("aria-label",title);
	btn.addEventListener("click",onclick);
	return btn;
}

// On/Off as one switch
function switchbutton(item){
	const on=prefs[item.key]===true;
	const btn=el("button","sswitch"+(on?" on":""));
	btn.setAttribute("role","switch");
	btn.setAttribute("aria-checked",on?"true":"false");
	btn.setAttribute("aria-label",item.label);
	btn.appendChild(el("span","sknob"));
	btn.addEventListener("click",() => setpref(item.key,!on));
	return btn;
}

// a slider with its value beside it; dragging (or Left/Right on the remote) applies at once
function slider(item){
	const box=el("div","sslider");
	const input=el("input","srange");
	input.setAttribute("type","range");
	input.setAttribute("min",String(item.min));
	input.setAttribute("max",String(item.max));
	input.setAttribute("step",String(item.step));
	input.setAttribute("data-dpadstep",String(item.step));
	input.setAttribute("aria-label",item.label);
	input.value=String(prefs[item.key]);
	const value=el("span","ssliderval",prefs[item.key]+item.unit);
	const fill=() => input.setAttribute("style","--fill:"+((Number(input.value)-item.min)/(item.max-item.min)*100)+"%");
	fill();
	input.addEventListener("input",() => {
		const now=Number(input.value);
		value.textContent=now+item.unit;
		fill();
		setprefquiet(item.key,now);
	});
	box.appendChild(input);
	box.appendChild(value);
	return box;
}

// previous / current / next, for a list too long for a row of buttons (the preview shows what each one looks like)
function stepper(item,box){
	let at=0;
	item.options.forEach((option,index) => { if(option[0]===prefs[item.key]){ at=index; } });
	const count=item.options.length;
	const go=(by) => setpref(item.key,item.options[(at+by+count)%count][0]);
	box.appendChild(iconbutton("back",t("Previous"),() => go(-1)));
	box.appendChild(el("span","sstepvalue",item.options[at][1]));
	const next=iconbutton("back",t("Next"),() => go(1));
	next.classList.add("flip");
	box.appendChild(next);
}

const POSITION_NAMES={top:t("Top"),center:t("Middle"),bottom:t("Bottom"),left:t("left"),right:t("right")};

// A position is easy to judge only when you can see the screen, so after picking one the panel fades away for a moment
const PEEK_MS=1600;
let peektimer=null;

function peek(){
	maindiv.classList.add("peek");
	clearTimeout(peektimer);
	peektimer=setTimeout(endpeek,PEEK_MS);
}

function endpeek(){
	clearTimeout(peektimer);
	maindiv.classList.remove("peek");
}

function positionpicker(item){
	const box=el("div","pospicker");
	if(item.withClock){
		box.appendChild(optionbutton(t("With the clock"),prefs[item.key]==="with-clock",() => { setpref(item.key,"with-clock"); peek(); },"clock"));
	}
	const grid=el("div","posgrid");
	["top","center","bottom"].forEach((v) => ["left","center","right"].forEach((h) => {
		const value=v+"-"+h;
		const cell=el("button","poscell"+(prefs[item.key]===value?" on":""));
		cell.setAttribute("title",(v==="center" && h==="center")?t("Middle"):POSITION_NAMES[v]+" "+(h==="center"?t("middle"):POSITION_NAMES[h]));
		cell.addEventListener("click",() => { setpref(item.key,value); peek(); });
		grid.appendChild(cell);
	}));
	box.appendChild(grid);
	return box;
}

function controlfor(item){
	const box=el("div","scontrol");
	if(item.type==="choice"){
		if(item.options===ON_OFF){
			box.appendChild(switchbutton(item));
		} else if(item.stepper){
			stepper(item,box);
		} else {
			item.options.forEach((option) => {
				const btn=optionbutton(option[1],prefs[item.key]===option[0],() => setpref(item.key,option[0]),option[2]);
				if(item.cards){ btn.classList.add("card"); }
				if(item.compact){ btn.classList.add("compact"); }
				box.appendChild(btn);
			});
		}
	} else if(item.type==="swatch"){
		item.options.forEach((option) => {
			const dot=el("button","swatch"+(prefs[item.key]===option[0]?" on":""));
			dot.style.backgroundColor="rgb("+option[0]+")";
			dot.setAttribute("title",option[1]);
			dot.addEventListener("click",() => setpref(item.key,option[0]));
			box.appendChild(dot);
		});
	} else if(item.type==="slider"){
		box.appendChild(slider(item));
	} else if(item.type==="position"){
		box.appendChild(positionpicker(item));
	} else if(item.type==="custom"){
		item.render(box,item);
	} else if(item.type==="action"){
		if(item.confirm && confirming===item){
			box.appendChild(el("span","sconfirm",item.confirm));
			const yes=optionbutton(item.confirmButton||t("Yes"),false,() => {
				confirming=null;
				item.run();
				renderpane();
			});
			yes.classList.add("action","danger");
			box.appendChild(yes);
			box.appendChild(optionbutton(t("Cancel"),false,() => {
				confirming=null;
				renderpane();
			}));
		} else {
			const btn=optionbutton(item.button,false,() => {
				if(item.confirm){
					confirming=item;
					renderpane();
				} else {
					item.run();
				}
			},item.icon);
			btn.classList.add("action");
			box.appendChild(btn);
		}
	}
	return box;
}

// the streamed videos by source, biggest first: "Apple 139 videos"
function rendersources(box){
	const counts={};
	const list=typeof aerials!=="undefined"?aerials:[];
	list.forEach((video) => { counts[video.s]=(counts[video.s] || 0)+1; });
	const names=Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
	const table=el("div","sources");
	names.forEach((name) => {
		const row=el("div","sourcerow");
		row.appendChild(el("span","sourcename",name));
		row.appendChild(el("span","sourcecount",counts[name]+(counts[name]===1?t(" video"):t(" videos"))));
		table.appendChild(row);
	});
	if(names.length===0){ table.appendChild(el("div","sstatus",t("No videos in this build."))); }
	box.appendChild(table);
	if(names.length>0){ box.appendChild(el("div","sstatus",list.length+t(" total"))); }
}

function renderpane(){
	const section=SETTINGS_SCHEMA.filter((s) => s.id===settingstab)[0];
	settingstabs.innerHTML="";
	SETTINGS_SCHEMA.forEach((s) => {
		const tab=el("button","stab"+(s.id===settingstab?" on":""),s.title);
		const picture=el("span","sicon");
		picture.innerHTML=iconsvg(s.icon);
		tab.appendChild(picture);
		tab.addEventListener("click",() => {
			confirming=null;
			settingstab=s.id;
			settingspane.scrollTop=0;
			sethint("");
			if(s.id==="tv"){ detecthomemethod(); }
			renderpane();
		});
		settingstabs.appendChild(tab);
	});
	settingspane.innerHTML="";
	section.items.forEach((item) => {
		if(item.show && !item.show(prefs)){ return; }
		if(item.type==="heading"){
			settingspane.appendChild(el("div","sheading",item.label));
			return;
		}
		const row=el("div",item.wide?"srow wide":"srow");
		const label=el("div","slabel");
		if(item.nolabel){ row.classList.add("nolabel"); } else { label.appendChild(el("span","slabeltext",item.label)); }
		if(item.hint){
			const mark=el("span","shintmark");
			mark.innerHTML=iconsvg("info");
			label.appendChild(mark);
		}
		row.appendChild(label);
		row.appendChild(controlfor(item));
		// the explanation lives in the strip under the panel, for the row that has the focus or the pointer
		row.hintof=item.hint || "";
		row.addEventListener("focusin",() => sethint(row.hintof));
		row.addEventListener("mouseenter",() => sethint(row.hintof));
		settingspane.appendChild(row);
	});
	renderpreview();
}

// the remote control moves its own focus ring (dpad.js) and not the browser's focus, so it tells us where it went
function settingsfocused(el){
	let node=el;
	while(node && node!==settingspane){
		if(node.hintof!==undefined){
			sethint(node.hintof);
			return;
		}
		node=node.parentNode;
	}
	sethint("");
}

// what the strip says while no setting with an explanation has the focus or the pointer
const HINT_LEGEND=t("Hover the info icon next to a setting for more");

function sethint(text){
	settingshint.classList.toggle("on",text!=="");
	settingshinttext.textContent=text!==""?text:HINT_LEGEND;
}

function settingsisopen(){
	return maindiv.classList.contains("settingsopen");
}

function opensettings(){
	renderpane();
	maindiv.classList.add("settingsopen");
}

function closesettings(){
	confirming=null;
	sethint("");
	endpeek();
	maindiv.classList.remove("settingsopen");
}

function initsettings(){
	loadprefs();
	startclock();
	applyprefs();
	settingsbtn.addEventListener("click",opensettings);
	settingsclose.innerHTML=iconsvg("close");
	settingshinticon.innerHTML=iconsvg("info");
	sethint("");
	settingsclose.addEventListener("click",closesettings);
	settingsbackdrop.addEventListener("click",closesettings);
	window.addEventListener("resize",applysizes);
	document.addEventListener("keydown",() => { if(maindiv.classList.contains("peek")){ endpeek(); } },true);
}

document.addEventListener("DOMContentLoaded",initsettings);
