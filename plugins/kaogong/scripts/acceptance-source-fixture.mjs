import * as fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {deflateSync} from 'node:zlib'
const hash=value=>createHash('sha256').update(value).digest('hex')
function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0)}return(value^0xffffffff)>>>0}
function chunk(type,bytes){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([name,bytes])));return Buffer.concat([length,name,bytes,crc])}
/** Deterministic non-sensitive chart: blue10, orange20; bitmap numbers are part of the PNG. */
export function acceptanceChart(){
 const width=160,height=100,pixels=Buffer.alloc(width*height*3,255),pixel=(x,y,color)=>{if(x>=0&&x<width&&y>=0&&y<height)for(let c=0;c<3;c++)pixels[(y*width+x)*3+c]=color[c]},rect=(x,y,w,h,color)=>{for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++)pixel(a,b,color)}
 rect(15,82,135,2,[45,45,45]);rect(35,52,25,30,[32,108,210]);rect(95,22,25,60,[235,126,34])
 const font={0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['111','001','111','100','111']}
 const text=(value,x,y)=>{for(const digit of value){for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(font[digit][row][col]==='1')rect(x+col*2,y+row*2,2,2,[35,35,35]);x+=8}}
 text('10',39,37);text('20',99,7)
 const scan=Buffer.alloc(height*(1+width*3));for(let y=0;y<height;y++)pixels.copy(scan,y*(width*3+1)+1,y*width*3,(y+1)*width*3)
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))])
}
/** Writes a NEW isolated synthetic source only. Supplied Native identity remains unverified until public Host inspection. */
export async function stageAcceptanceSource({outputRoot,sessionId,presetId,cwd,nativeKind}){
 if(!path.isAbsolute(outputRoot)||!path.isAbsolute(cwd)||nativeKind!=='sequenced'||![sessionId,presetId].every(value=>typeof value==='string'&&value.length>0&&value.length<500&&!/[\s\x00-\x1f]/.test(value)))throw Error('EXPLICIT_REAL_NATIVE_FACTS_REQUIRED')
 const parent=await fs.realpath(path.dirname(outputRoot)),root=path.join(parent,path.basename(outputRoot));await fs.mkdir(root)
 const home=path.join(root,'source-home'),materialRoot=path.join(root,'materials'),questionImageRoot=path.join(root,'question-images')
 await fs.mkdir(path.join(home,'storages'),{recursive:true});await fs.mkdir(path.join(materialRoot,'storage/mineru'),{recursive:true});await fs.mkdir(questionImageRoot)
 await fs.writeFile(path.join(materialRoot,'storage/mineru/rebuild-manifest.json'),JSON.stringify({version:1,documents:[]}),{flag:'wx'})
 const image=acceptanceChart();await fs.writeFile(path.join(questionImageRoot,'bars.png'),image,{flag:'wx'})
 const questions={};for(let index=1;index<=10;index++)questions['synthetic-data-'+String(index).padStart(2,'0')]={subject:'行测-资料分析',knowledgePoint:'图表直接读取',questionType:'单选',stem:`合成资料第${index}题：下图中橙色柱表示的数值是多少？\n![蓝色10、橙色20的合成柱图](bars.png)`,options:['A. 10','B. 20','C. 30','D. 40'],correctAnswer:'B',explanation:'合成柱图中橙色柱上方标注20，因此选择B。',difficulty:'easy',source:'独立合成验收题',origin:'local',reviewStatus:'approved',reviewNotes:'仅用于非敏感合成流程验收',tags:['synthetic-acceptance'],createdAt:'2026-10-24',reviewedAt:'2026-10-24'}
 const lecture={subject:'行测-资料分析',knowledgePoint:'图表直接读取',title:'私有合成讲义：读取柱图',kind:'讲义',content:'# 合成学习目标\n先看图例与柱顶数字，再读取指定颜色的数据。蓝色柱为10，橙色柱为20。\n\n这是一条私有合成讲义，不是原始PDF，不共享到资料库。',source:'synthetic-private-no-pdf',tags:['synthetic-acceptance'],createdAt:'2026-10-24',updatedAt:'2026-10-24'}
 const binding={key:{appId:'kaogong',instanceId:'default',roleId:'teacher',subject:'行测-资料分析'},sessionId,presetId,selectedPreset:true,creation:{cwd},phase:'ready',previousSessionIds:[]}
 const specs={kaogong_bank:[2,'questions',questions,null],kaogong_knowledge:[1,'entries',{'synthetic-private-lecture':lecture},null],kaogong_lessons:[1,'lessons',{}, {instanceId:'default',activeLessonId:null}],kaogong_notebook:[1,'questions',{},null],kaogong_practice:[1,'rounds',{},null],kaogong_progress:[1,'days',{}, {examDate:'2027-03-01',dailyModules:1,subjects:[{name:'行测-资料分析',weight:1}]}],personal_workbench_role_bindings:[1,'bindings',{'synthetic-existing-teacher':binding},null]}
 const sourceHashes={};for(const[name,[version,table,rows,global]]of Object.entries(specs)){const bytes=Buffer.from(JSON.stringify({unit:{name,version},global,tables:{[table]:rows}}));await fs.writeFile(path.join(home,'storages',name+'.json'),bytes,{flag:'wx'});sourceHashes[name]=hash(bytes)}
 const receipt={format:'kaogong-synthetic-acceptance-source',fixtureOnly:true,formalData:false,nativeIdentity:'unverified-until-public-host-inspection',expectedNativeKind:nativeKind,sourceHome:home,materialRoot,questionImageRoot,questionIds:Object.keys(questions),privateLectureId:'synthetic-private-lecture',expectedAnswers:Object.fromEntries(Object.keys(questions).map(id=>[id,'B'])),chartSha256:hash(image),sourceHashes}
 await fs.writeFile(path.join(root,'fixture-receipt.private.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600})
 return receipt
}
