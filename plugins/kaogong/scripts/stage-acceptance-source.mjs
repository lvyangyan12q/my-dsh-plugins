import {stageAcceptanceSource} from './acceptance-source-fixture.mjs'
try{
 const input={};for(let index=2;index<process.argv.length;index+=2){const key=process.argv[index],value=process.argv[index+1];if(!['--output-root','--session-id','--preset-id','--cwd','--native-kind'].includes(key)||!value||input[key])throw Error('EXPLICIT_ARGUMENTS_REQUIRED');input[key]=value}
 const receipt=await stageAcceptanceSource({outputRoot:input['--output-root'],sessionId:input['--session-id'],presetId:input['--preset-id'],cwd:input['--cwd'],nativeKind:input['--native-kind']})
 console.log(JSON.stringify({fixtureOnly:true,formalData:false,nativeIdentity:receipt.nativeIdentity,sourceHome:receipt.sourceHome,materialRoot:receipt.materialRoot,questionImageRoot:receipt.questionImageRoot,bankQuestions:receipt.questionIds.length,privateLectures:1,initialRounds:0,initialNotebook:0}))
}catch(error){console.error('SOURCE_STAGE_REFUSED: '+(error.code??(error.message?.match(/^[A-Z_]+$/)?error.message:'INVALID_INPUT')));process.exitCode=1}
