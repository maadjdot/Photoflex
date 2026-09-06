// Review-only browser fixture: isolated non-persistent context; no user database is accessed.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1672,height:941}});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  await page.goto('http://127.0.0.1:5174/');
  await page.waitForTimeout(2000);
  console.log('INITIAL',await page.locator('body').innerText(),errors);
  await page.screenshot({path:path.join(__dirname,'initial-diagnostic.png')});
  await page.locator('.app-shell').waitFor();
  await page.evaluate(async()=>{
    const req=indexedDB.open('photoflex-mvp');
    const db=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});
    const tx=db.transaction(['projects','photo-index','photo-thumbnails','sequences','versions'],'readwrite');
    const projectId='review-project',sourceId='review-source',sequenceId='review-sequence',createdAt='2026-09-06T00:00:00.000Z';
    const ids=Array.from({length:160},(_,i)=>`review-photo-${String(i).padStart(3,'0')}`);
    const placements=Object.fromEntries(ids.slice(0,8).map((photoId,i)=>[photoId,{photoId,x:(i%4)*180,y:Math.floor(i/4)*170,width:156,height:117,z:i,filename:`PF_${2401+i}.jpg`}]));
    const items=ids.slice(0,12).map((photoId,i)=>({id:`review-item-${i}`,kind:'photo',photoId}));
    const readingUnits=items.map((item,i)=>({id:`review-unit-${i}`,kind:'single',itemId:item.id}));
    tx.objectStore('projects').put({schemaVersion:6,projectId,name:'Coastal Notes · Review fixture',memo:'',expectedPhotoCount:null,sources:[{id:sourceId,displayName:'Coastal Walks',createdAt}],photoStates:{},worktableDraft:{projectId,entryOrder:ids.slice(0,8),placements,groups:[],links:[],pileOrder:[sequenceId],pilePlacements:{[sequenceId]:{sequenceId,x:100,y:360,width:211,height:142,z:9}}},sequenceIds:[sequenceId],versionIds:['review-version'],revision:0,createdAt,updatedAt:createdAt,lastOpenedAt:createdAt});
    tx.objectStore('sequences').put({id:sequenceId,projectId,name:'Coastal edit',items,segments:[],readingUnits,currentVersionId:'review-version',revision:0,createdAt,updatedAt:createdAt});
    tx.objectStore('versions').put({id:'review-version',projectId,sequenceId,name:'Initial',itemCount:12,items,segments:[],readingUnits,createdAt});
    ids.forEach((id,i)=>{
      tx.objectStore('photo-index').put({id,sourceId,relativePath:`PF_${2401+i}.jpg`,width:i%3?1200:800,height:i%3?900:1200});
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${i%3?400:200}" height="300"><rect width="100%" height="100%" fill="hsl(${28+i*11} 20% 72%)"/><path d="M0 260L95 155L180 225L270 105L400 225V300H0Z" fill="#5c655d"/><rect x="8" y="8" width="184" height="284" fill="none" stroke="white" stroke-width="3"/><text x="20" y="60" font-size="24" fill="#222">${i+1}</text></svg>`;
      tx.objectStore('photo-thumbnails').put({photoId:id,blob:new Blob([svg],{type:'image/svg+xml'})});
    });
    await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();
  });
  await page.goto('http://127.0.0.1:5174/#/projects/review-project/table');
  await page.locator('.table-source-photo').first().waitFor();
  await page.locator('.sequence-strip-item').first().waitFor();
  await page.waitForTimeout(700);
  const geometry=await page.evaluate(()=>{
    const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}};
    return {source:rect('.table-source-browser'),grid:rect('.table-source-grid'),strip:rect('.sequence-strip'),stripImageFit:getComputedStyle(document.querySelector('.sequence-strip-item img, .sequence-strip-item .thumb-placeholder')).objectFit,toolbar:rect('.table-toolbar'),rootChildren:document.querySelector('#root').childElementCount};
  });
  await page.screenshot({path:path.join(__dirname,'current-1672.png')});
  await page.getByRole('button',{name:'Expand',exact:true}).click();
  await page.screenshot({path:path.join(__dirname,'current-expanded-1672.png')});
  await page.getByRole('button',{name:'Compact',exact:true}).click();
  const grid=page.locator('.table-source-grid');
  await grid.hover();
  await page.mouse.wheel(0,620);
  await page.waitForTimeout(450);
  if(await grid.count()){await page.mouse.wheel(0,620);await page.waitForTimeout(450);}
  const after={rootChildren:await page.locator('#root').evaluate(e=>e.childElementCount),text:await page.locator('body').innerText(),errors};
  await page.screenshot({path:path.join(__dirname,'current-after-scroll.png')});
  fs.writeFileSync(path.join(__dirname,'runtime-evidence.json'),JSON.stringify({fixture:'Isolated Chrome context, 160 generated thumbnails, 12 sequence items',geometry,after},null,2));
  console.log(JSON.stringify({geometry,after},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
