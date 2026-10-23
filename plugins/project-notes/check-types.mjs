import {writeFileSync,mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {checkPublicProducer} from './public-producer.mjs'
const receipt=checkPublicProducer()
if(process.env.NOTES_TYPES_RECEIPT){mkdirSync(dirname(process.env.NOTES_TYPES_RECEIPT),{recursive:true});writeFileSync(process.env.NOTES_TYPES_RECEIPT,JSON.stringify(receipt,null,2)+'\n')}
console.log(JSON.stringify(receipt,null,2))
