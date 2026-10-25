import {mkdir,writeFile,access} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {deflateSync} from 'node:zlib'
export async function materialsSourceFixture(destination,{certified=false,optionProof=false}={}){
const root=resolve(destination)
try{await access(root);throw Error('Destination already exists; refusing overwrite')}catch(error){if(error.code!=='ENOENT')throw error}
const home=join(root,'source-home'),materialRoot=join(root,'original-synthetic-materials'),imageRoot=join(root,'question-images'),jobId='3156b214-3156-4156-8156-3156b2143156',jobRoot=join(materialRoot,'storage/mineru',jobId)
await mkdir(join(home,'storages'),{recursive:true});await mkdir(imageRoot,{recursive:true});await mkdir(join(jobRoot,'assets/images'),{recursive:true})
const sha=value=>createHash('sha256').update(value).digest('hex')
const crc=bytes=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0}
const chunk=(type,data)=>{const typeBytes=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([typeBytes,data])));return Buffer.concat([length,typeBytes,data,sum])}
const width=320,height=240,raw=Buffer.alloc(height*(width*3+1),255)
for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const axis=x>=48&&x<=50&&y>=25&&y<=202||y>=200&&y<=202&&x>=48&&x<=280;const bar=(x>=90&&x<140&&y>=120&&y<200)||(x>=190&&x<240&&y>=40&&y<200);if(axis||bar){const i=y*(width*3+1)+1+x*3;raw[i]=axis?50:70;raw[i+1]=axis?50:120;raw[i+2]=axis?50:190}}}
const glyphs={'1':['010','110','010','010','111'],'0':['111','101','101','101','111'],'2':['111','001','111','100','111'],'A':['010','101','111','101','101'],'B':['110','101','110','101','110']}
function label(text,x,y){for(const char of text){const glyph=glyphs[char];for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(glyph[row][col]==='1')for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){const i=(y+row*3+dy)*(width*3+1)+1+(x+col*3+dx)*3;raw.fill(25,i,i+3)}x+=13}}
label('10',103,98);label('20',203,18);label('A',109,213);label('B',209,213)
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
await writeFile(join(imageRoot,'synthetic-bars-10-20.png'),png,{flag:'wx'});await writeFile(join(jobRoot,'assets/images/synthetic-bars-10-20.png'),png,{flag:'wx'})
const stream='BT /F1 16 Tf 30 240 Td (ORIGINAL SYNTHETIC ACCEPTANCE DATA) Tj 0 -24 Td (A = 10; B = 20. Not an exam paper.) Tj 0 -24 Td (Options: A. 10; B. 20; C. 30; D. 40.) Tj ET 0.3 0.5 0.8 rg 70 50 45 70 re f 170 50 45 140 re f'
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 280] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]
let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
const pdfBytes=Buffer.from(pdf),pdfPath=join(materialRoot,'ORIGINAL-SYNTHETIC-NOT-EXAM.pdf'),fingerprint=sha(pdfBytes),rawId='mineru_'+fingerprint+'_1-1',reference=`/api/kaogong/document-image?id=${jobId}&asset=images%2Fsynthetic-bars-10-20.png`,content=`# 原创合成资料（非真实考题，非实际 MinerU 输出）\n\n| 项目 | 数量 |\n|---|---|\n| A | 10 |\n| B | 20 |\n\n![原创合成柱图 A10 B20](${reference})\n\n此清单仅模拟公开旧资料证明格式，用于接入与撤销验收，不声称运行过解析服务。`
await writeFile(pdfPath,pdfBytes,{flag:'wx'});await writeFile(join(jobRoot,'knowledge.md'),content,{flag:'wx'});await writeFile(join(jobRoot,'job.json'),JSON.stringify({id:jobId,batchId:'synthetic-ledger-NOT-A-REAL-PARSER-RUN',source:pdfPath,subject:'行测-资料分析',title:'ORIGINAL-SYNTHETIC-NOT-EXAM.pdf',pages:'1-1',synthetic:true}),{flag:'wx'})
await writeFile(join(materialRoot,'storage/mineru/rebuild-manifest.json'),JSON.stringify({version:1,synthetic:true,notice:'Hand-authored synthetic proof ledger; no actual MinerU request performed',documents:[{file:pdfPath,fingerprint,pages:1,subject:'行测-资料分析',kind:'讲义',jobs:[{id:jobId,pages:'1-1',state:'done',characters:content.length,images:1}]}]}),{flag:'wx'})
const date='2026-10-25',base={subject:'行测-资料分析',knowledgePoint:'读取柱状图',questionType:'单选',options:['A. 10',optionProof?'B. 20\\n公考最新资料、更新进度微信 SKA674':'B. 20','C. 30','D. 40'],correctAnswer:'B',explanation:'原创合成图中 B 柱为20，A柱为10。',difficulty:'easy',source:'原创合成验收数据（非真题）',origin:'local',reviewStatus:'approved',reviewNotes:'本次验收原创合成',tags:['原创合成验收'],createdAt:date,reviewedAt:date},questions=Object.fromEntries(Array.from({length:10},(_,i)=>['synthetic-b-'+(i+1),{...base,stem:`原创合成第${i+1}题：图中 B 项数量为多少？\n\n![原创合成 A10 B20](题目_images/synthetic-bars-10-20.png)`}]))
const common={subject:'行测-资料分析',knowledgePoint:'读取柱状图',kind:'讲义',tags:[],createdAt:date,updatedAt:date}
const entries={[rawId]:{...common,knowledgePoint:'',title:'ORIGINAL-SYNTHETIC-NOT-EXAM.pdf [PDF 1-1]',content,source:pdfPath+'#pages=1-1',tags:['MinerU','待校对','mineru-job:'+jobId]},'synthetic-private-lecture':{...common,title:'原创合成私有讲义',content:'# 私有合成讲义\n\n本段只在资料库自身查看，不得通过跨实例 materials 只读共享读取。\n\n合成记忆词：蓝色纸风车。',source:'private-original-synthetic'}}
for(const[name,version,table,values]of [['kaogong_bank',2,'questions',questions],['kaogong_knowledge',1,'entries',entries]])await writeFile(join(home,'storages',name+'.json'),JSON.stringify({unit:{name,version},global:null,tables:{[table]:values}}),{flag:'wx'})
const config={materialSourceHome:home,legacyMaterialRoot:materialRoot,questionImageRoot:imageRoot,mineru:{outputDir:join(materialRoot,'storage/mineru')}}
await writeFile(join(root,'configuration.private.json'),JSON.stringify(config,null,2),{flag:'wx'})
await writeFile(join(root,'README.md'),'# 原创合成验收资料\n\n10道答案B的原创合成图表题、1份原创合成PDF资料与手写证明清单（没有运行或伪装实际MinerU）、1份私有讲义。无Native会话或旧学习状态字段。配置见configuration.private.json。所有文件仅新写本目录。\n',{flag:'wx'})
if(certified){await mkdir(join(imageRoot,'verified'),{recursive:true});await writeFile(join(imageRoot,'verified/synthetic-bars-10-20.png'),png,{flag:'wx'});await writeFile(join(imageRoot,'verified/associations.json'),JSON.stringify({version:1,associations:Object.entries(questions).map(([questionId,row])=>({questionId,stemSha256:sha(row.stem),asset:'verified/synthetic-bars-10-20.png',assetSha256:sha(png),sourcePdfSha256:sha(pdfBytes),sourcePage:1}))}),{flag:'wx'})}
if(certified&&optionProof)await writeFile(join(imageRoot,'verified/option-repairs.json'),JSON.stringify({version:1,associations:Object.entries(questions).map(([questionId,row])=>({questionId,stemSha256:sha(row.stem),optionsSha256:sha(JSON.stringify(row.options)),optionIndices:[0,1,2,3],sourceOptions:['A. 10','B. 20','C. 30','D. 40'],sourcePdfSha256:sha(pdfBytes),sourcePage:1}))}),{flag:'wx'})
return {root,...config,png,pdfBytes,questions}
}
