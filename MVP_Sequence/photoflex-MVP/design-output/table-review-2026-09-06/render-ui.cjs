const {chromium}=require('@playwright/test'),path=require('node:path'),fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const checks=[];
for(const [mode,width,height,name] of [['expanded',1672,941,'01-proposed-expanded'],['compact',1440,900,'02-proposed-compact'],['closed',1672,941,'03-proposed-collapsed'],['project',1672,941,'04-proposed-project'],['expanded',1280,800,'05-proposed-1280'],['error',1672,941,'06-proposed-error']]){
 await page.setViewportSize({width,height});
 await page.goto('file:///'+path.join(__dirname,'ui-prototype.html').replace(/\\/g,'/')+'?mode='+mode+'&capture=1');
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
 await page.screenshot({path:path.join(__dirname,name+'.png')});
 checks.push(await page.evaluate(({mode,width,height})=>({mode,width,height,missingImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),documentOverflow:document.documentElement.scrollWidth>innerWidth,sourceGridOverflow:!!document.querySelector('.grid-scroll')&&document.querySelector('.grid-scroll').scrollWidth>document.querySelector('.grid-scroll').clientWidth,sourceWidth:document.querySelector('.sidebar').getBoundingClientRect().width,sequenceHeight:document.querySelector('.order').getBoundingClientRect().height}),{mode,width,height}));
}
fs.writeFileSync(path.join(__dirname,'ui-visual-check.json'),JSON.stringify({checks,errors},null,2));
console.log(JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
