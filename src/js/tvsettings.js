//SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the OpenHome contributors
// TV settings, inside OUR settings - so the TV's own menu never has to be opened.
//
// Everything here is a real key in com.webos.settingsservice. The names are LG's own: they were
// read out of /usr/palm/applications/com.palm.app.settings/main.js, where each setting appears as
//     VH("<key>") ... Up("<Title>"), Up("<Help sentence>")
// and the Serbian comes from LG's own sr/strings.json, keyed by the English title. The full
// extraction is in the repo: tv-settings-labeled.md / .json.
//
// The CONTROLS are not hard-coded. getSystemSettingDesc tells us, per key, whether it is a range
// (with min/max/interval) or a list of allowed values - and which of those values are currently
// active. So the pane always offers exactly what this TV accepts, and a firmware change cannot
// leave it offering something that no longer exists.
//
// About dimensions, which took a while to get right: picture and some sound keys are stored per
// (input x pictureMode). The trap is passing a `dimension` yourself - guess one field wrong and
// the service answers "no result from DB". Leaving it out entirely is correct: the service
// resolves the CURRENT context and tells you in the reply which one it used. That is also what a
// person means by "change the picture" - they mean the picture they are looking at. The active
// context is shown above the picture group so it is never a surprise.
//
// Whatever is changed here is also written to a state file that
// /var/lib/webosbrew/init.d/tweaks.sh replays at boot, because this TV has been seen to forget
// settings across a power cycle.

const TVS_STATEFILE="/var/lib/webosbrew/openlauncher-tvsettings.json";
const TVS_WRITE_DELAY=450;   // ms a slider must be still before the value is sent to the TV

const TVS_GROUPS=[
	{id:"privacy",title:t("Privacy"),items:[
		{k:"adCookie",cat:"general",label:t("Advertisement"),help:t("Tracking for personalised ads.")},
		{k:"livePlus",cat:"option",label:t("Live Plus"),
			help:t("Recognises what you watch and offers recommendations and ads based on it.")},
		{k:"livePromotion",cat:"option",label:t("Live Promotion")},
		{k:"homePromotion",cat:"general",label:t("Home Promotion"),
			help:t("\u201cSponsored\u201d ads on the home screen.")},
		{k:"lmt",cat:"general",label:t("Limit AD Tracking")},
		{k:"doNotSellMyPersonalInformation",cat:"general",label:t("Do Not Sell My Personal Information")},
		{k:"aiNudge",cat:"general",label:t("Smart Tips")},
		{k:"aiSettingsNudge",cat:"general",label:t("Smart Tips in Settings")},
		{k:"contentRecommendation",cat:"other",label:t("Content Recommendation")},
		{k:"thirdPartyCookie",cat:"option",label:t("Third-Party Cookies")},
		{k:"faultLogUpload",cat:"option",label:t("User Report"),
			help:t("Sends error logs to LG.")},
		{k:"usageCare",cat:"option",label:t("Usage Care"),
			help:t("LG watches how you use the TV and suggests changes.")}
	]},
	{id:"screen",title:t("Screen & Home"),items:[
		{k:"screenSaverEnabled",cat:"general",label:t("Screen Saver"),
			help:t("The TV's own menu has no such item - only a standby timer, with no way to turn it off.")},
		{k:"noSignalScreenSaver",cat:"general",label:t("No-Signal Screen Saver"),
			help:t("The message shown when an input has no picture.")},
		{k:"energySaving",cat:"picture",label:t("Energy Saving"),
			help:t("Dims the backlight. \u201cAutomatic\u201d follows the scene.")},
		{k:"homeEffect",cat:"general",label:t("Home Animation")},
		{k:"standByLight",cat:"option",label:t("Standby Light"),
			help:t("The red dot on the TV while it is off.")},
		{k:"homeWallPaper",cat:"option",label:t("Wallpaper (LG home)")},
		{k:"tvOnSound",cat:"general",label:t("Power-On Sound Volume")},
		{k:"welcomeFeature",cat:"general",label:t("Welcome Feature")},
		{k:"touchLock",cat:"general",label:t("Touch Lock")},
		{k:"selectedInputApp",cat:"general",label:t("Power-On Input")}
	]},
	{id:"picture",title:t("Picture"),context:true,items:[
		{k:"pictureMode",cat:"picture",label:t("Picture Mode"),
			help:t("Everything below is remembered SEPARATELY for each mode and each input.")},
		{k:"backlight",cat:"picture",label:t("Backlight")},
		{k:"contrast",cat:"picture",label:t("Contrast")},
		{k:"brightness",cat:"picture",label:t("Brightness")},
		{k:"color",cat:"picture",label:t("Color")},
		{k:"sharpness",cat:"picture",label:t("Sharpness")},
		{k:"colorTemperature",cat:"picture",label:t("Color Temperature"),help:t("Minus is cooler, plus is warmer.")},
		{k:"gamma",cat:"picture",label:t("Gamma(Adjust Brightness)")},
		{k:"dynamicContrast",cat:"picture",label:t("Auto Dynamic Contrast")},
		{k:"superResolution",cat:"picture",label:t("Super Resolution")},
		{k:"noiseReduction",cat:"picture",label:t("Noise Reduction")},
		{k:"mpegNoiseReduction",cat:"picture",label:t("MPEG Noise Reduction")},
		{k:"realCinema",cat:"picture",label:t("Real Cinema"),help:t("24-frame film without judder.")},
		{k:"aspectRatio",cat:"picture",label:t("Aspect Ratio")}
	]},
	{id:"pictureplus",title:t("Picture+"),context:true,items:[
		{k:"localDimming",cat:"picture",label:t("LED Local Dimming")},
		{k:"dynamicColor",cat:"picture",label:t("Color Adjustment")},
		{k:"colorGamut",cat:"picture",label:t("Color Gamut")},
		{k:"peakBrightness",cat:"picture",label:t("Gamma(Adjust Brightness)")},
		{k:"smoothGradation",cat:"picture",label:t("Smooth Gradation")},
		{k:"hdrDynamicToneMapping",cat:"picture",label:t("Dynamic Tone Mapping")},
		{k:"motionEyeCare",cat:"picture",label:t("Motion Eye Care")},
		{k:"expressionEnhancer",cat:"picture",label:t("Expression Enhancer")},
		{k:"enableDolbyVisionPC",cat:"picture",label:t("Dolby Vision PC")}
	]},
	{id:"accessibility",title:t("Accessibility"),items:[
		{k:"audioGuidance",cat:"option",label:t("Audio Guidance")},
		{k:"audioGuidanceVolume",cat:"option",label:t("Volume")},
		{k:"audioGuidanceSpeed",cat:"option",label:t("Speed")},
		{k:"audioGuidancePitch",cat:"option",label:t("Pitch")},
		{k:"highContrast",cat:"option",label:t("Text with High Contrast")},
		{k:"screenMagnification",cat:"option",label:t("Grayscale")},
		{k:"focusEmphasis",cat:"option",label:t("Grayscale")},
		{k:"hardOfHearing",cat:"caption",label:t("Hard of Hearing")},
		{k:"visualImpaired",cat:"sound",label:t("Video Description")},
		{k:"remoteSlowInput",cat:"option",label:t("Extend Pressing Time on Remote")},
		{k:"longPressInterval",cat:"option",label:t("Activate time for long press")},
		{k:"repeatInterval",cat:"option",label:t("Interval time for repeated actions")}
	]},
	{id:"sound",title:t("Sound"),items:[
		{k:"autoVolume",cat:"sound",label:t("Automatic Volume Adjustment"),
			help:t("Evens out loudness between channels and adverts.")},
		{k:"supportATMOS",cat:"sound",label:t("Dolby Atmos")},
		{k:"eArcSupport",cat:"sound",label:t("eARC Support")},
		{k:"userEqualizer",cat:"sound",label:t("Equalizer")},
		{k:"magicSpaceSound",cat:"sound",label:t("AI Acoustic Tuning")},
		{k:"digitalAudioPriority",cat:"sound",label:t("DTV Audio Setting")},
		{k:"tvSetupConfiguration",cat:"sound",label:t("Installation Type"),
			help:t("On a stand or on a wall - it changes how the TV processes sound.")},
		{k:"tvPowerSound",cat:"sound",label:t("Device Power Sound")},
		{k:"lgSoundSync",cat:"sound",label:t("LG Sound Sync")},
		{k:"audioDescription",cat:"sound",label:t("Audio Description")},
		// All four HDMI format keys carry the same generic LG title, so they are named by port here.
		{k:"inputAudioFormatHDMI1",cat:"sound",label:t("HDMI 1 Audio Format")},
		{k:"inputAudioFormatHDMI2",cat:"sound",label:t("HDMI 2 Audio Format")},
		{k:"inputAudioFormatHDMI3",cat:"sound",label:t("HDMI 3 Audio Format")},
		{k:"soundOutput",cat:"sound",label:t("Sound Output")},
		{k:"soundMode",cat:"sound",label:t("Sound Mode")},
		{k:"multiChannelAudio",cat:"option",label:t("Multi Channel Audio")},
		{k:"bluetoothMode",cat:"sound",label:t("Bluetooth Playback")},
		{k:"avSync",cat:"sound",label:t("AV Sync")}
	]},
	{id:"hdmi",title:t("HDMI"),items:[
		{k:"simplinkEnable",cat:"other",label:t("SIMPLINK (HDMI-CEC)"),
			help:t("This is why the TV jumps to the console by itself when you switch it on.")},
		{k:"444BypassHDMI1",cat:"other",label:t("4:4:4 Pass Through · HDMI 1"),
			help:t("Full chroma for a PC. Turn it on only on the port the computer is on.")},
		{k:"444BypassHDMI2",cat:"other",label:t("4:4:4 Pass Through · HDMI 2")},
		{k:"444BypassHDMI3",cat:"other",label:t("4:4:4 Pass Through · HDMI 3")},
		{k:"uhdDeepColor",cat:"other",label:t("HDMI Deep Colour")},
		{k:"qmsVrr",cat:"other",label:t("Variable Refresh Rate (VRR)")}
	]},
	{id:"poweroff",title:t("Power Off"),items:[
		{k:"automaticStandBy",cat:"time",label:t("Auto Power Off"),
			help:t("How many hours without a command before the TV switches off."),
			names:{"0":t("Never"),"2":"2 h","4":"4 h","6":"6 h","8":"8 h"}},
		{k:"noOperationAutoOff",cat:"time",label:t("No-Operation Auto Off"),
			help:t("Hours of inactivity before switching off."),
			names:{off:t("Never"),"3":"3 h","6":"6 h","12":"12 h","24":"24 h"}},
		{k:"noSignalAutoOff",cat:"time",label:t("No-Signal Auto Off")},
		{k:"screenOffTime",cat:"option",label:t("Screen Off"),
			help:t("Minutes until only the screen goes off; the sound stays on."),
			names:{"5":"5 min","10":"10 min","30":"30 min","60":"60 min","120":"120 min"}},
		{k:"screenSaverTimer",cat:"option",label:t("Screen Saver Standby Time")},
		{k:"autoOff15Min",cat:"time",label:t("Auto Off After 15 min")}
	]},
	{id:"network",title:t("Network"),custom:"network",items:[
		{k:"wolwowlOnOff",cat:"network",label:t("Wake on LAN")},
		{k:"bleAdvertisingOnOff",cat:"network",label:t("OK")},
		{k:"ipv6Enable",cat:"network",label:t("IPv6")},
		{k:"allowMobileDeviceAccess",cat:"network",label:t("Phone Access"),
			help:t("Lets a phone app control the TV.")}
	]},
	{id:"wifi",title:t("Wi-Fi"),custom:"wifi",items:[]},
	{id:"bluetooth",title:t("Bluetooth"),custom:"bluetooth",items:[]},
	{id:"devices",title:t("Devices"),custom:"devices",items:[]},
	{id:"system",title:t("System"),items:[
		{k:"quickStartMode",cat:"option",label:t("Quick Start+"),
			help:t("Starts the TV faster, but draws power while it is off.")},
		{k:"storeMode",cat:"option",label:t("Home / Store Mode"),
			help:t("Must stay on \u201cHome\u201d. \u201cStore\u201d turns on the shop demo.")},
		{k:"lowPowerMode",cat:"other",label:t("Low Power Mode")},
		{k:"remotePointer",cat:"general",label:t("Remote Pointer")},
		{k:"pointerSpeed",cat:"option",label:t("Tracking Speed")},
		{k:"pointerSize",cat:"option",label:t("Pointer Size")},
		{k:"helpOnSettings",cat:"option",label:t("Settings Help")},
		{k:"seniorMode",cat:"option",label:t("Simple Mode")},

	]}
];

// Serbian for the values the TV answers with. Anything missing falls through to the raw value,
// which is better than an empty button.
const TVS_VALUE_NAMES={
	on:t("On"), off:t("Off"), auto:t("Automatic"),
	low:t("Low"), medium:t("Medium"), high:t("High"),
	min:t("Minimum"), med:t("Medium"), max:t("Maximum"),
	standard:t("Standard"), bass:t("Bass"), treble:t("Treble"),
	vivid:t("Vivid"), eco:t("Eco"), cinema:t("Cinema"), sports:t("Sports"), game:t("Game"),
	filmMaker:t("FilmMaker"), expert1:t("Expert 1"), expert2:t("Expert 2"), normal:t("Normal"),
	stand:t("On a stand"), wall_mount:t("Wall mounted"),
	bitstream:t("Bitstream"), pcm:t("PCM"),
	mpeg:t("MPEG"), dolbyDigital:t("Dolby Digital"), dobyDigitalPlus:t("Dolby Digital+"), heAaC:t("HE-AAC"),
	"16x9":t("16:9"), "4x3":t("4:3"), "14x9":t("14:9"), original:t("Original"), full_wide:t("Full wide"),
	zoom:t("Zoom"), zoom2:t("Zoom 2"), cinema_zoom:t("Cinema zoom"), just_scan:t("Just scan"),
	surroundMode:t("Surround"), speakerMode:t("Speakers"),
	"True":t("On"), "False":t("Off"),
	home:t("Home"), store:t("Store"), general:t("Standard"), simple:t("Simple"),
	small:t("Small"), large:t("Large"), slow:t("Slow"), normal:t("Normal"), fast:t("Fast"),
	none:t("None"), opt1:t("Wallpaper 1"), opt2:t("Wallpaper 2"), opt3:t("Wallpaper 3"),
	high1:t("High 1"), high2:t("High 2"), "0":t("Never"),
	"4k":t("4K"), "8k":t("8K"), veryLow:t("Very low"), veryHigh:t("Very high"),
	veryFast:t("Very fast"), verySlow:t("Very slow"), basic:t("Basic"),
	tv_speaker:t("TV speakers"), external_arc:t("HDMI ARC"), external_optical:t("Optical"),
	bt_soundbar:t("Bluetooth soundbar"), headphone:t("Headphones"), lineout:t("Line out"),
	bt_audio:t("Bluetooth"), tv_speakerbar:t("TV + soundbar"), usb_speaker:t("USB speaker"),
	aiSoundPlus:t("AI Sound+"), movie:t("Movie"), news:t("News"), music:t("Music"),
	"true":t("On"), "false":t("Off"), HDMI_1:t("HDMI 1"), HDMI_2:t("HDMI 2"), HDMI_3:t("HDMI 3")
};

// What each setting actually does. Where LG has its own explanation in its Serbian locale
// file it is used verbatim; the rest are written here, as are the few where the extractor
// picked up the NEIGHBOURING setting's sentence (homeEffect got the standby light's text).
const TVS_INFO={
	ipv6Enable:t("A newer version of the network protocol. Leave it on unless your router has trouble with it."),
	allowMobileDeviceAccess:t("Lets the LG ThinQ app on a phone control this TV."),

	uhdDeepColor:t("Game Optimizer is turned off."),
	qmsVrr:t("This switches the screen softly without interruptions when other contents with different FPS (Frame Per Second) are played in external devices supporting QMS."),
	localDimming:t("Clear the dark image."),
	dynamicColor:t("Adjust color and saturation automatically to make the image brighter and more vivid."),
	colorGamut:t("Expand the range of colors that can be displayed."),
	peakBrightness:t("Adjust the maximum brightness to effectively show the brightest light on the screen."),
	smoothGradation:t("Creates smooth color gradients along the edges of the image."),
	hdrDynamicToneMapping:t("Adjust the contrast in real-time when watching HDR video."),
	motionEyeCare:t("The screen brightness is automatically adjusted according to the motions in the video."),
	expressionEnhancer:t("It is a technology to improve the contrast and expression of foreground, background and object by analyzing the information of the HDR image."),
	enableDolbyVisionPC:t("Go to display settings and turn HDR on to enjoy the Dolby Vision screen."),
	audioGuidance:t("This feature describes menu names or device statuses via audio."),
	audioGuidanceVolume:t("Adjust Audio Guidance volume."),
	audioGuidanceSpeed:t("Adjust Audio Guidance speed."),
	audioGuidancePitch:t("Adjust Audio Guidance pitch."),
	highContrast:t("You can see texts more clearly by adjusting the color of menus and texts."),
	screenMagnification:t("All screens turn black and white."),
	focusEmphasis:t("All screens turn black and white."),
	hardOfHearing:t("Display the broadcast sound as captions."),
	visualImpaired:t("This describes the content of broadcasting programs that support {name}."),
	remoteSlowInput:t("When it's difficult to operate by holding down the remote control button for an extended period, users can directly set the button input time to make it easier to use."),
	longPressInterval:t("When executing functions by holding down the remote control button for a long time, you can adjust the button press duration."),
	repeatInterval:t("You can adjust the repeated actions speed of buttons that perform continuous actions when held down, such as volume or channel buttons."),
	soundOutput:t("The microphone on the Magic Remote collects the sound around the TV and analyzes the acoustics of surrounding and performs the optimal sound."),
	soundMode:t("AI learned via LG Deep Learning technique provides the optimal sound and Virtual multi-channel surround according to the genre of viewing content."),
	multiChannelAudio:t("Content will play with sound suitable for multi-channel listening if multi-channel audio is supported by the HbbTV service."),
	bluetoothMode:t("Select the playback option of the speakers connected to the TV."),
	avSync:t("Select the audio format according to the HDMI input method."),
	tvOnSound:t("You can adjust the sound effects when the TV is turned on or off and the screen moves."),
	welcomeFeature:t("The ambient lighting will be provided when motion is detected around the TV."),
	touchLock:t("Set sensitivity of Motion Sensor on your TV."),
	selectedInputApp:t("Select the screen to display when the TV is turned on."),
	screenSaverTimer:t("Set the time until the screen saver appears."),
	wolwowlOnOff:t("Turn on the TV using your mobile device via Wi-Fi."),
	bleAdvertisingOnOff:t("Turn on the TV using mobile device via Bluetooth."),
	autoOff15Min:t("Turns the TV off if the selected input has no signal for 15 minutes."),
	adCookie:t("Check for Advertising settings and set it."),
	livePlus:t("Recognises what is on screen and sends viewing data to LG, for recommendations and ads."),
	livePromotion:t("Turn custom ads and services on or off while watching content."),
	homePromotion:t("You can set to show or hide \u201cSponsored\u201d advertisements that appear in the home menu."),
	lmt:t("Stops apps from using this TV's advertising identifier to track you."),
	doNotSellMyPersonalInformation:t("Activating this toggle will cause LGE to instruct its third party providers to cease commercializing your personal information."),
	aiNudge:t("You\u2019ll get recommendations for convenient features you can use while watching TV or using an app."),
	aiSettingsNudge:t("It recommends settings or features, such as settings you use the most or settings you use together."),
	contentRecommendation:t("Display content recommendation categories in the Home menu."),
	thirdPartyCookie:t("Sets whether to allow Third-party cookies on HbbTV."),
	faultLogUpload:t("Report will be sent automatically to solve problems that occurred while using LG TV."),
	usageCare:t("Make your viewing habits safer and healthier."),
	screenSaverEnabled:t("The screen saver after 30 minutes idle. LG's own menu has no switch for this - only a timer."),
	noSignalScreenSaver:t("The message shown when the selected input has no picture."),
	energySaving:t("The screen brightness will be controlled in accordance with the Energy Saving Step."),
	homeEffect:t("Turn on/off standby light."),
	homeAutoLaunch:t("Select the screen to display when the TV is turned on."),
	standByLight:t("Turn on/off standby light."),
	homeWallPaper:t("Your selected Home wallpaper is displayed in Black Mode."),
	pictureMode:t("'Personalized Picture Wizard' can be set based on the your preference determined by an analysis of image quality attributes such as brightness, color and contrast using AI deep learning technology."),
	backlight:t("How hard the panel's backlight runs. The biggest lever on power draw and on daylight visibility."),
	contrast:t("The gap between the brightest and darkest parts. Too high swallows detail in the whites."),
	brightness:t("Black level. Too high greys out black, too low swallows shadow detail."),
	color:t("Colour saturation. The middle is neutral."),
	sharpness:t("Artificial edge enhancement. High values draw a white halo around objects."),
	colorTemperature:t("Minus is cooler (bluer), plus is warmer (yellower). Warmer is truer for film."),
	gamma:t("The lower the gamma value, the brighter the mid-tone, and the larger the gamma value, the darker it becomes."),
	dynamicContrast:t("Optimize contrast settings based on image brightness."),
	superResolution:t("This feature is used to make the blurry and crushed parts of the image clear."),
	noiseReduction:t("Remove irregular and erratic pixels for a clearer image."),
	mpegNoiseReduction:t("Remove irregular and erratic pixels for a clearer image when watching a video saved in MPEG format."),
	realCinema:t("Adjust the frame ratio in the same way with the movie and it provides the feeling of the movie theater."),
	aspectRatio:t("How the picture fits the screen. 16:9 is standard; \u201cOriginal\u201d leaves the source format alone."),
	autoVolume:t("Adjust sound for each program automatically when switching content so that the volume is constant."),
	supportATMOS:t("Enjoy Dolby Atmos content with vivid surround effect."),
	eArcSupport:t("Enhance the reception frequency when the HDMI(ARC) audio device supports eARC."),
	userEqualizer:t("Optimize sound by adjusting the TV speaker setting."),
	magicSpaceSound:t("The microphone on the Magic Remote collects the sound around the TV and analyzes the acoustics of surrounding and performs the optimal sound."),
	digitalAudioPriority:t("Select digital audio output format."),
	tvSetupConfiguration:t("Adjust the sound for a stand-type TV."),
	tvPowerSound:t("Alerts you by sound when the TV is turned on or off."),
	lgSoundSync:t("Enjoy TV sound through audio devices connected to the OPTICAL DIGITAL AUDIO OUT."),
	audioDescription:t("This describes the content of broadcasting programs that support {name}."),
	inputAudioFormatHDMI1:t("Select the audio format according to the HDMI input method."),
	inputAudioFormatHDMI2:t("Select the audio format according to the HDMI input method."),
	inputAudioFormatHDMI3:t("Select the audio format according to the HDMI input method."),
	simplinkEnable:t("SIMPLINK allows you to use the remote control to turn on/off and control SIMPLINK devices connected to the TV through HDMI."),
	"444BypassHDMI1":t("Full 4:4:4 chroma for a PC - without it small text is fuzzy at the edges. It turns off picture processing on that port."),
	"444BypassHDMI2":t("Full 4:4:4 chroma for a PC on HDMI 2."),
	"444BypassHDMI3":t("Full 4:4:4 chroma on HDMI 3."),
	automaticStandBy:t("The TV will be turned off automatically if the user does not operate the TV or remote control for a certain period of time."),
	noOperationAutoOff:t("Set the time to turn off the TV automatically without user input."),
	noSignalAutoOff:t("Turns the TV off when an input has had no signal for a while."),
	screenOffTime:t("Turn off the standby screen after the set time."),
	quickStartMode:t("Standby mode will remain active to shorten the wake up time and execution time of features such as apps and search."),
	storeMode:t("Select the place where to use the TV."),
	lowPowerMode:t("Cuts power draw at the cost of brightness and speed."),
	remotePointer:t("The pointer in the remote control can be used like a computer mouse."),
	pointerSpeed:t("Adjust cursor speed."),
	pointerSize:t("You can adjust the Magic Remote pointer size."),
	helpOnSettings:t("Turn on/off description box in Settings."),
	seniorMode:t("A simpler home screen and everyday care features, easier to use.")
};

let tvsvalues=null;      // key -> current value, as the TV reports it right now
let tvsdesc={};          // key -> {range:{min,max,interval}} or {choices:[...]}
let tvscontext=null;     // which (input x pictureMode) the picture values belong to
let tvswanted=[];        // [{c,k,v}] - what the boot script should put back
let tvsgroup="privacy";
let tvsbusy=null;
let tvsasked=false;
let tvspending=null;     // debounce timer for sliders

function tvshasroot(){
	return typeof rooted!=="undefined" && rooted && typeof execasroot==="function";
}

function tvsvaluename(value){
	return TVS_VALUE_NAMES[String(value)] || String(value);
}

function tvscats(){
	const cats={};
	TVS_GROUPS.forEach((g) => g.items.forEach((each) => { cats[each.cat]=true; }));
	return Object.keys(cats);
}

// One shell: current values and the description of every category we touch. `< /dev/null` is
// required or luna-send prints nothing at all when the root service hands it a pipe for stdin.
async function tvsread(){
	if(!tvshasroot()){ return; }
	const parts=[];
	tvscats().forEach((cat) => {
		parts.push('echo @V'+cat+'; luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettings '+
			"'"+JSON.stringify({category:cat})+"' < /dev/null 2>/dev/null");
		parts.push('echo @D'+cat+'; luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettingDesc '+
			"'"+JSON.stringify({category:cat})+"' < /dev/null 2>/dev/null");
	});
	parts.push('echo @WANTED; cat '+shellquote(TVS_STATEFILE)+' 2>/dev/null');
	let out="";
	try {
		const r=await execasroot(parts.join('; '));
		out=String((r && r.stdoutString) || "");
	} catch(e) { return; }

	const got={}, desc={};
	out.split("@").slice(1).forEach((chunk) => {
		const name=chunk.slice(0,chunk.indexOf("\n")).trim();
		const body=chunk.slice(chunk.indexOf("\n")+1);
		if(name==="WANTED"){
			tvswanted=body.split("\n").map((line) => {
				try { return JSON.parse(line); } catch(e) { return null; }
			}).filter((each) => each && each.k);
			return;
		}
		let answer;
		try { answer=JSON.parse(body.slice(body.indexOf("{"))); } catch(e) { return; }
		if(name.charAt(0)==="V"){
			Object.keys(answer.settings || {}).forEach((key) => { got[key]=answer.settings[key]; });
			// the reply says which (input x pictureMode) it answered for
			if(name.slice(1)==="picture" && answer.dimension){ tvscontext=answer.dimension; }
		} else {
			(answer.results || []).forEach((each) => {
				if(!each.key){ return; }
				const values=each.values || {};
				if(values.range){
					desc[each.key]={range:values.range};
				} else if(Array.isArray(values.arrayExt)){
					desc[each.key]={choices:values.arrayExt
						.filter((one) => one && one.visible!==false && one.active!==false)
						.map((one) => one.value)};
				}
			});
		}
	});
	tvsvalues=got;
	tvsdesc=desc;
}

async function tvswrite(item,value){
	if(!tvshasroot()){ return; }
	tvsbusy=item.k;
	const settings={};
	settings[item.k]=String(value);
	// No `dimension` on purpose - see the note at the top of this file.
	const payload=JSON.stringify({category:item.cat,settings:settings});
	tvswanted=tvswanted.filter((each) => each.k!==item.k)
		.concat([{c:item.cat,k:item.k,v:String(value)}]);
	const file=tvswanted.map((each) => JSON.stringify(each)).join("\n")+"\n";
	try {
		await execasroot(
			"luna-send -n 1 -f luna://com.webos.settingsservice/setSystemSettings '"+payload+"' < /dev/null 2>/dev/null; "+
			"mkdir -p /var/lib/webosbrew; "+
			"printf '%s' "+shellquote(file)+" > "+shellquote(TVS_STATEFILE)+" 2>/dev/null; true");
		await tvsread();
	} catch(e) {}
	tvsbusy=null;
	if(typeof renderpane==="function" && settingsisopen()){ renderpane(); }
}

// ---- controls -------------------------------------------------------------

function tvschoicebuttons(item,current){
	const info=tvsdesc[item.k] || {};
	let choices=info.choices;
	if(!choices || !choices.length){
		// The TV listed no values for this key. Assuming on/off would be wrong for anything that
		// is not a switch, so a pair is only offered when the current value is itself one half of
		// an obvious pair; otherwise the value is just shown.
		const pair=[["on","off"],["True","False"]]
			.filter((each) => each.indexOf(String(current))!==-1)[0];
		if(!pair){ return el("span","sstatus",String(current)); }
		choices=pair;
	}
	const wrap=el("div","tvsbuttons");
	choices.forEach((value) => {
		// item.names lets one setting name its values without that name leaking to every other
		// setting that happens to use the same raw value ("2" is 2 hours here, nothing elsewhere)
		const name=(item.names && item.names[value]) || tvsvaluename(value);
		wrap.appendChild(optionbutton(name,String(current)===String(value),
			() => tvswrite(item,value)));
	});
	return wrap;
}

// A real <input type="range">, because dpad.js already steers those with left/right on the remote
// (it reads data-dpadstep). The TV is only written to once the value stops moving.
function tvsrangecontrol(item,current){
	const info=tvsdesc[item.k].range;
	const step=Number(info.interval)||1;
	const wrap=el("div","tvsbuttons");
	const box=el("div","sslider");
	const input=el("input","srange");
	input.setAttribute("type","range");
	input.setAttribute("min",String(info.min));
	input.setAttribute("max",String(info.max));
	input.setAttribute("step",String(step));
	input.setAttribute("data-dpadstep",String(step));
	input.setAttribute("aria-label",item.label);
	input.value=String(Number(current));
	const shown=el("span","ssliderval",String(Number(current)));
	const fill=() => input.setAttribute("style",
		"--fill:"+((Number(input.value)-info.min)/(info.max-info.min)*100)+"%");
	fill();
	input.addEventListener("input",() => {
		shown.textContent=input.value;
		fill();
		clearTimeout(tvspending);
		const value=input.value;
		tvspending=setTimeout(() => { tvswrite(item,value); },TVS_WRITE_DELAY);
	});
	box.appendChild(input);
	box.appendChild(shown);
	wrap.appendChild(box);
	return wrap;
}

// ---- device lists ---------------------------------------------------------
//
// Bluetooth, the network and the inputs are not key/value settings - they are lists of things
// with actions on them, which is why they could not just be rows like the rest. They come from
// their own services: bluetooth2 for the adapter and the paired devices, connectionmanager for
// the link, eim for what is plugged into which HDMI port.

let tvsdev=null;        // {bt:{adapter,devices}, net:{}, inputs:[], v5:{}}
let tvsdevasked=false;
let tvsdevbusy=null;

async function tvsreaddevices(){
	if(!tvshasroot()){ return; }
	const q=(tag,uri,payload) =>
		'echo @'+tag+'; luna-send -n 1 -f '+uri+" '"+(payload||"{}")+"' < /dev/null 2>/dev/null";
	let out="";
	try {
		const r=await execasroot([
			q("BTA","luna://com.webos.service.bluetooth2/adapter/getStatus"),
			q("BTD","luna://com.webos.service.bluetooth2/device/getStatus"),
			q("NET","luna://com.webos.service.connectionmanager/getStatus"),
			q("INP","luna://com.webos.service.eim/getAllInputStatus"),
			q("SIG","luna://com.webos.service.eim/getHDMISignalInfo")
		].join("; "));
		out=String((r && r.stdoutString) || "");
	} catch(e) { return; }
	const part={};
	out.split("@").slice(1).forEach((chunk) => {
		const name=chunk.slice(0,chunk.indexOf("\n")).trim();
		try { part[name]=JSON.parse(chunk.slice(chunk.indexOf("{"))); } catch(e) {}
	});
	const sig={};
	Object.keys((part.SIG) || {}).forEach((key) => {
		const port=/^HDMI(\d+)$/.exec(key);
		if(port && part.SIG[key]){ sig[Number(port[1])]=String(part.SIG[key]["5v"]).toUpperCase()==="TRUE"; }
	});
	tvsdev={
		adapter:((part.BTA || {}).adapters || [])[0] || null,
		devices:(part.BTD || {}).devices || [],
		net:part.NET || {},
		inputs:(part.INP || {}).devices || [],
		v5:sig
	};
}

async function tvsbt(action,address){
	if(tvsdevbusy){ return; }
	tvsdevbusy=address;
	if(typeof renderpane==="function"){ renderpane(); }
	try {
		await execasroot("luna-send -n 1 -f luna://com.webos.service.bluetooth2/a2dp/"+action+
			" '"+JSON.stringify({address:address})+"' < /dev/null 2>/dev/null; true");
		await new Promise((go) => setTimeout(go,1200));
		await tvsreaddevices();
	} catch(e) {}
	tvsdevbusy=null;
	if(typeof renderpane==="function" && settingsisopen()){ renderpane(); }
}

// one line per device or input: name on the left, state and any action on the right
function tvsdevrow(wrap,title,subtitle,right){
	const row=el("div","tvsrow");
	const head=el("div","tvshead");
	head.appendChild(el("span","tvslabel",title));
	if(subtitle){ head.appendChild(el("small","tvshelp",subtitle)); }
	row.appendChild(head);
	const box=el("div","tvsbuttons");
	if(typeof right==="string"){ box.appendChild(el("span","sstatus",right)); }
	else if(right){ box.appendChild(right); }
	row.appendChild(box);
	wrap.appendChild(row);
}


// ---- Bluetooth: searching, pairing, forgetting -----------------------------
//
// Discovery results normally arrive on a subscription, which one-shot luna-send cannot hold. It
// does not need to: startDiscovery puts the adapter into scanning mode and device/getStatus then
// returns everything seen so far, so polling that every few seconds gives the same list.
//
// Pairing is attempted with adapter/pair. Devices that pair without a code ("just works" - most
// headphones, speakers, keyboards) complete on their own. A device that wants a passkey needs
// adapter/awaitPairingRequests held open to receive the request, which this cannot do, so the
// attempt is reported as failed and LG's own menu stays the way to do those.

const BT_SCAN_POLL=2500;
const BT_SCAN_MAX=45000;     // stop by itself; a scanning radio costs power and Wi-Fi throughput

let tvsbtscanning=false;
let tvsbtpoll=null;
let tvsbtstopper=null;
let tvsbtnote="";

async function tvsbtcall(method,payload){
	try {
		const r=await execasroot("luna-send -n 1 -f luna://com.webos.service.bluetooth2/adapter/"+method+
			" '"+JSON.stringify(payload||{})+"' < /dev/null 2>&1");
		return JSON.parse(String((r && r.stdoutString) || "{}").slice(
			String((r && r.stdoutString) || "{}").indexOf("{")));
	} catch(e) { return {returnValue:false}; }
}

function tvsbtrepaint(){
	if(typeof renderpane==="function" && settingsisopen() && tvsgroup==="bluetooth"){ renderpane(); }
}

async function tvsbtscan(on){
	clearInterval(tvsbtpoll);
	clearTimeout(tvsbtstopper);
	tvsbtpoll=null;
	tvsbtstopper=null;
	if(!on){
		tvsbtscanning=false;
		await tvsbtcall("cancelDiscovery");
		await tvsreaddevices();
		tvsbtrepaint();
		return;
	}
	tvsbtnote="";
	const answer=await tvsbtcall("startDiscovery");
	tvsbtscanning=answer.returnValue===true;
	if(!tvsbtscanning){ tvsbtnote=t("Search could not be started."); }
	tvsbtrepaint();
	if(!tvsbtscanning){ return; }
	tvsbtpoll=setInterval(async () => {
		await tvsreaddevices();
		tvsbtrepaint();
	},BT_SCAN_POLL);
	tvsbtstopper=setTimeout(() => { tvsbtscan(false); },BT_SCAN_MAX);
}

async function tvsbtpair(device){
	if(tvsdevbusy){ return; }
	tvsdevbusy=device.address;
	tvsbtnote="";
	tvsbtrepaint();
	const answer=await tvsbtcall("pair",{address:device.address});
	if(answer.returnValue!==true){
		tvsbtnote=(device.name||device.address)+t(": pairing failed")+
			(answer.errorText?(" ("+answer.errorText+")"):"")+t(". Devices that ask for a code have to go through the TV's own menu.");
	}
	await tvsreaddevices();
	tvsdevbusy=null;
	tvsbtrepaint();
}

async function tvsbtforget(device){
	if(tvsdevbusy){ return; }
	tvsdevbusy=device.address;
	tvsbtrepaint();
	await tvsbtcall("unpair",{address:device.address});
	await tvsreaddevices();
	tvsdevbusy=null;
	tvsbtrepaint();
}

// RSSI comes back as a raw field that is not always a sane dBm; it is only used to sort, and
// anything obviously out of range is pushed to the bottom rather than shown as a number.
function tvsbtstrength(device){
	const value=Number(device.rssi);
	return (isFinite(value) && value<0 && value>-120)?value:-999;
}


// ---- Wi-Fi ----------------------------------------------------------------
//
// findnetworks gives everything in range with its security type and whether a profile is already
// saved for it (profileId). Connecting to a saved network needs only the ssid; a new secured one
// needs the key. The field is type="text" and not "password" on purpose: dpad.js only treats
// text and search inputs as typeable, and on a remote control seeing what you typed matters more
// than hiding it from a room you are sitting alone in.

let tvswifi=null;        // {networks:[], profiles:[]}
let tvswifiasked=false;
let tvswifiscanning=false;
let tvswifibusy="";
let tvswifiopen="";      // ssid whose key field is showing
let tvswifinote="";

async function tvswifiread(){
	if(!tvshasroot()){ return; }
	const q=(tag,method) => 'echo @'+tag+'; luna-send -n 1 -f luna://com.webos.service.wifi/'+method+
		" '{}' < /dev/null 2>/dev/null";
	let out="";
	try {
		const r=await execasroot(q("NETS","findnetworks")+"; "+q("PROF","getprofilelist"));
		out=String((r && r.stdoutString) || "");
	} catch(e) { return; }
	const part={};
	out.split("@").slice(1).forEach((chunk) => {
		const name=chunk.slice(0,chunk.indexOf("\n")).trim();
		try { part[name]=JSON.parse(chunk.slice(chunk.indexOf("{"))); } catch(e) {}
	});
	tvswifi={
		networks:((part.NETS || {}).foundNetworks || []).map((one) => one.networkInfo).filter(Boolean),
		profiles:((part.PROF || {}).profileList || []).map((one) => one.wifiProfile).filter(Boolean)
	};
}

function tvswifirepaint(){
	if(typeof renderpane==="function" && settingsisopen() && tvsgroup==="wifi"){ renderpane(); }
}

async function tvswifiscan(){
	if(tvswifiscanning){ return; }
	tvswifiscanning=true;
	tvswifinote="";
	tvswifirepaint();
	try { await execasroot("luna-send -n 1 -f luna://com.webos.service.wifi/scan '{}' < /dev/null 2>/dev/null; true"); } catch(e) {}
	await new Promise((go) => setTimeout(go,3500));
	await tvswifiread();
	tvswifiscanning=false;
	tvswifirepaint();
}

async function tvswificall(method,payload,label){
	tvswifibusy=label;
	tvswifinote="";
	tvswifirepaint();
	let answer={};
	try {
		const r=await execasroot("luna-send -n 1 -f luna://com.webos.service.wifi/"+method+
			" '"+JSON.stringify(payload)+"' < /dev/null 2>&1");
		const text=String((r && r.stdoutString) || "{}");
		answer=JSON.parse(text.slice(text.indexOf("{")));
	} catch(e) { answer={returnValue:false}; }
	if(answer.returnValue!==true){
		tvswifinote=t("Failed")+(answer.errorText?(": "+answer.errorText):".");
	}
	await new Promise((go) => setTimeout(go,2500));
	await tvswifiread();
	await tvsreaddevices();
	tvswifibusy="";
	tvswifirepaint();
	return answer;
}

function tvswificonnect(net,key){
	const payload={ssid:net.ssid};
	const secured=(net.availableSecurityTypes || []).filter((one) => one!=="none")[0];
	if(secured && key){
		payload.security={securityType:secured,simpleSecurity:{passKey:key}};
	}
	tvswifiopen="";
	return tvswificall("connect",payload,net.ssid);
}

function tvsrenderwifi(wrap){
	tvsrendernetinfo(wrap);
	const head=el("div","tvsrow");
	const headleft=el("div","tvshead");
	headleft.appendChild(el("span","tvslabel",tvswifiscanning?t("Searching for networks..."):t("Wi-Fi networks")));
	head.appendChild(headleft);
	const headright=el("div","tvsbuttons");
	headright.appendChild(optionbutton(tvswifiscanning?"...":t("Refresh"),tvswifiscanning,
		() => tvswifiscan()));
	head.appendChild(headright);
	wrap.appendChild(head);
	if(tvswifinote){ wrap.appendChild(el("div","sstatus",tvswifinote)); }
	if(!tvswifi){
		if(!tvswifiasked){
			tvswifiasked=true;
			tvswifiread().then(tvswifirepaint);
		}
		wrap.appendChild(el("div","sstatus",t("Reading networks...")));
		return;
	}
	const saved={};
	tvswifi.profiles.forEach((one) => { saved[one.ssid]=one.profileId; });
	const seen={};
	const nets=tvswifi.networks.filter((one) => {
		if(!one.ssid || seen[one.ssid]){ return false; }
		seen[one.ssid]=true;
		return true;
	}).sort((a,b) => (b.signalLevel||0)-(a.signalLevel||0));
	if(!nets.length){ wrap.appendChild(el("div","sstatus",t("No networks found."))); return; }

	nets.forEach((net) => {
		const secured=(net.availableSecurityTypes || []).filter((one) => one!=="none")[0];
		const here=/ipConfigured|connected/.test(String(net.connectState||""));
		const bits=[(secured?t("secured (")+secured+")":t("open")),
			t("signal ")+(net.signalLevel||0)+"%"];
		if(saved[net.ssid] && !here){ bits.push(t("saved")); }
		let right;
		if(tvswifibusy===net.ssid){ right=t("connecting..."); }
		else if(here){ right=t("connected"); }
		else {
			right=el("div","tvsbuttons");
			if(secured && !saved[net.ssid]){
				right.appendChild(optionbutton(tvswifiopen===net.ssid?t("Cancel"):t("Connect"),
					tvswifiopen===net.ssid,
					() => { tvswifiopen=(tvswifiopen===net.ssid?"":net.ssid); tvswifirepaint(); }));
			} else {
				right.appendChild(optionbutton(t("Connect"),false,() => tvswificonnect(net,"")));
			}
			if(saved[net.ssid]){
				right.appendChild(optionbutton(t("Forget"),false,
					() => tvswificall("deleteprofile",{profileId:saved[net.ssid]},net.ssid)));
			}
		}
		tvsdevrow(wrap,net.displayName||net.ssid,bits.join(" · "),right);
		// the key field, opened by the button above
		if(tvswifiopen===net.ssid){
			const keyrow=el("div","tvsrow");
			const field=el("input","stext");
			field.setAttribute("type","text");
			field.setAttribute("placeholder",t("Password for ")+net.ssid);
			field.setAttribute("maxlength","63");
			keyrow.appendChild(field);
			const go=el("div","tvsbuttons");
			go.appendChild(optionbutton(t("Connect"),false,() => {
				const key=field.value;
				if(key.length<8){ tvswifinote=t("The password must be at least 8 characters."); tvswifirepaint(); return; }
				tvswificonnect(net,key);
			}));
			keyrow.appendChild(go);
			wrap.appendChild(keyrow);
			setTimeout(() => { try { field.focus(); } catch(e) {} },60);
		}
	});
}

function tvsrenderbluetooth(wrap){
	const adapter=tvsdev.adapter;
	if(!adapter){
		wrap.appendChild(el("div","sstatus",t("Bluetooth is not available.")));
		return;
	}
	wrap.appendChild(el("div","tvscontext",
		t("Adapter: ")+(adapter.powered?t("on"):t("off"))+" · "+(adapter.name||"")));
	// search control
	const search=el("div","tvsrow");
	const searchhead=el("div","tvshead");
	searchhead.appendChild(el("span","tvslabel",tvsbtscanning?t("Searching for devices..."):t("Device search")));
	searchhead.appendChild(el("small","tvshelp",tvsbtscanning
		?t("Switch the device on and put it in pairing mode. The search stops by itself after 45 seconds.")
		:t("Start the search, then pair whatever shows up.")));
	search.appendChild(searchhead);
	const searchbox=el("div","tvsbuttons");
	searchbox.appendChild(optionbutton(tvsbtscanning?t("Stop"):t("Search"),tvsbtscanning,
		() => tvsbtscan(!tvsbtscanning)));
	search.appendChild(searchbox);
	wrap.appendChild(search);
	if(tvsbtnote){ wrap.appendChild(el("div","sstatus",tvsbtnote)); }

	const paired=tvsdev.devices.filter((each) => each && each.paired);
	// named, unpaired, strongest first - the air is full of nameless beacons
	const nearby=tvsdev.devices
		.filter((each) => each && !each.paired && String(each.name||"").trim())
		.sort((a,b) => tvsbtstrength(b)-tvsbtstrength(a))
		.slice(0,12);
	if(nearby.length){
		wrap.appendChild(el("div","tvssub",t("Nearby")));
		nearby.forEach((device) => {
			tvsdevrow(wrap,device.name,
				(device.typeOfDevice==="ble"?"Bluetooth LE":"Bluetooth")+" · "+device.address,
				tvsdevbusy===device.address?t("pairing...")
					:optionbutton(t("Pair"),false,() => tvsbtpair(device)));
		});
	} else if(tvsbtscanning){
		wrap.appendChild(el("div","sstatus",t("Nothing with a name found yet...")));
	}

	if(paired.length){ wrap.appendChild(el("div","tvssub",t("Paired"))); }
	if(!paired.length){
		wrap.appendChild(el("div","sstatus",t("No paired devices.")));
		return;
	}
	paired.forEach((device) => {
		const connected=(device.connectedProfiles || []).length>0;
		// only audio devices have something to connect to from here
		const audio=(device.serviceClasses || []).some((one) => one && one.category==="/a2dp");
		const kind=device.typeOfDevice==="ble"?"Bluetooth LE":"Bluetooth";
		let right;
		if(tvsdevbusy===device.address){ right=t("changing..."); }
		else {
			right=el("div","tvsbuttons");
			if(audio){
				right.appendChild(optionbutton(connected?t("Disconnect"):t("Connect"),connected,
					() => tvsbt(connected?"disconnect":"connect",device.address)));
			}
			right.appendChild(optionbutton(t("Forget"),false,() => tvsbtforget(device)));
		}
		tvsdevrow(wrap,device.name||device.address,
			kind+" · "+device.address+(connected?" · povezan":""),right);
	});
}

function tvsrenderinputs(wrap){
	const inputs=tvsdev.inputs.filter((each) => each && /hdmi/.test(String(each.appId||"")));
	if(!inputs.length){
		wrap.appendChild(el("div","sstatus",t("No input data.")));
		return;
	}
	inputs.forEach((input) => {
		const cec=(input.subList || []).filter((one) => one && one.cecPower)[0];
		const awake=cec?(cec.cecPower==="On"):(tvsdev.v5[input.port]===true);
		let state;
		if(!input.connected){ state=t("empty"); }
		else if(awake){ state=t("on"); }
		else { state=t("connected, off"); }
		const detail=[];
		if(cec && cec.osdName){ detail.push(cec.osdName); }
		if(input.spdVendorName){ detail.push(input.spdVendorName); }
		detail.push(cec?"CEC":t("no CEC"));
		// the label is only worth showing when it is a real device name, not "HDMI 1" again
		const port="HDMI "+input.port;
		const label=String(input.label||"").replace(/\s+/g,"");
		const named=input.connected && label && label.toUpperCase()!==port.replace(" ","");
		tvsdevrow(wrap,port+(named?" · "+input.label:""),detail.join(" · "),state);
	});
}

function tvsrendernetinfo(wrap){
	const net=tvsdev.net || {};
	const wifi=net.wifi, wired=net.wired;
	const live=(wired && wired.state==="connected")?wired:((wifi && wifi.state==="connected")?wifi:null);
	let text=t("Not connected");
	if(live){
		text=(live===wired?t("Wired network"):String(wifi.ssid||"Wi-Fi"))+
			" · "+(live.ipAddress||"?")+
			(net.isInternetConnectionAvailable?" · "+t("internet works"):" · "+t("no internet"));
	}
	wrap.appendChild(el("div","tvscontext",text));
}

function tvsrow(box,item){
	const row=el("div","tvsrow");
	const head=el("div","tvshead");
	const name=el("span","tvslabel",item.label);
	// The panel already has a strip along its bottom that explains whatever row you are on, and
	// an info glyph marking rows that have something to say. Reusing both means these rows behave
	// exactly like the launcher's own settings instead of inventing a second idea of "help".
	const explain=TVS_INFO[item.k] || item.help || "";
	if(explain){
		const mark=el("span","shintmark");
		mark.innerHTML=iconsvg("info");
		name.appendChild(mark);
	}
	head.appendChild(name);
	if(item.help){ head.appendChild(el("small","tvshelp",item.help)); }
	row.appendChild(head);
	// settingsfocused() in settings.js walks up from whatever the remote's ring landed on looking
	// for a `hintof`, so setting it here is all the remote needs. The two listeners cover the
	// mouse and the browser's own focus.
	row.hintof=explain;
	if(explain && typeof sethint==="function"){
		row.addEventListener("focusin",() => sethint(explain));
		row.addEventListener("mouseenter",() => sethint(explain));
	}
	const current=tvsvalues?tvsvalues[item.k]:undefined;
	const info=tvsdesc[item.k];
	if(current===undefined || current===null || typeof current==="object"){
		row.appendChild(el("span","sstatus",t("not available")));
	} else if(info && info.range){
		row.appendChild(tvsrangecontrol(item,current));
	} else {
		row.appendChild(tvschoicebuttons(item,current));
	}
	box.appendChild(row);
}

function rendertvsettings(box){
	if(!tvshasroot()){
		box.appendChild(el("div","sstatus",t("Root required.")));
		return;
	}
	if(tvsvalues===null){
		if(!tvsasked){
			tvsasked=true;
			tvsread().then(() => { if(typeof renderpane==="function" && settingsisopen()){ renderpane(); } });
		}
		box.appendChild(el("div","sstatus",t("Reading settings from the TV...")));
		return;
	}
	// One block wrapper: the settings pane lays its children out as a wrapping flex row, so rows
	// appended straight to `box` flow into each other sideways instead of stacking.
	const wrap=el("div","tvswrap");
	const tabs=el("div","tvstabs");
	TVS_GROUPS.forEach((g) => {
		tabs.appendChild(optionbutton(g.title,tvsgroup===g.id,() => {
			tvsgroup=g.id;
			if(typeof renderpane==="function"){ renderpane(); }
		}));
	});
	wrap.appendChild(tabs);
	const group=TVS_GROUPS.filter((g) => g.id===tvsgroup)[0] || TVS_GROUPS[0];
	// a scanning radio costs power and eats into Wi-Fi throughput, so it never outlives its tab
	if(tvsbtscanning && group.id!=="bluetooth"){ tvsbtscan(false); }
	if(group.custom){
		if(tvsdev===null){
			if(!tvsdevasked){
				tvsdevasked=true;
				tvsreaddevices().then(() => { if(typeof renderpane==="function" && settingsisopen()){ renderpane(); } });
			}
			wrap.appendChild(el("div","sstatus",t("Reading devices...")));
			box.appendChild(wrap);
			return;
		}
		if(group.custom==="wifi"){ tvsrenderwifi(wrap); }
		else if(group.custom==="bluetooth"){ tvsrenderbluetooth(wrap); }
		else if(group.custom==="devices"){ tvsrenderinputs(wrap); }
		else if(group.custom==="network"){ tvsrendernetinfo(wrap); }
	}
	if(group.context && tvscontext){
		const mode=tvscontext.pictureMode?tvsvaluename(tvscontext.pictureMode):"?";
		const input=tvscontext.input==="default"?t("current input"):tvscontext.input;
		wrap.appendChild(el("div","tvscontext",t("Changing for: ")+mode+" · "+input));
	}
	group.items.forEach((item) => tvsrow(wrap,item));
	box.appendChild(wrap);
}

(function(){
	if(typeof SETTINGS_SCHEMA==="undefined"){ return; }
	const tv=SETTINGS_SCHEMA.filter((each) => each.id==="tv")[0];
	if(!tv){ return; }
	// in front of the launcher's own TV items, because this is what gets used day to day
	tv.items.unshift(
		{type:"heading",label:t("TV Settings"),show:(p) => rooted},
		{label:t("TV Settings"),type:"custom",wide:true,nolabel:true,show:(p) => rooted,
			render:(box) => rendertvsettings(box)}
	);
})();

document.addEventListener("DOMContentLoaded",() => {
	setTimeout(() => { tvsread(); },9000);
	// ...and it does not outlive the settings panel either
	const closewas=window.closesettings;
	if(typeof closewas==="function"){
		window.closesettings=function(){
			if(tvsbtscanning){ tvsbtscan(false); }
			return closewas.apply(this,arguments);
		};
	}
});
