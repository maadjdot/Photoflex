// Recover reference photos into the review deliverable only; original deleted files stay untouched.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
fs.mkdirSync(path.join(__dirname,'assets'),{recursive:true});
for(let i=1;i<=16;i++){
 const name=`p${String(i).padStart(2,'0')}.jpg`;
 const data=execFileSync('git',['show',`HEAD:MVP_Sequence/photoflex-MVP/design-output/sequence-ui-prototype/assets/${name}`],{maxBuffer:20*1024*1024});
 fs.writeFileSync(path.join(__dirname,'assets',name),data);
}
console.log('16 existing reference photos copied to review assets.');
