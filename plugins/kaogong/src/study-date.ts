/** Study schedules use the user's local calendar date, never the UTC date prefix. */
export function studyDate(value:Date=new Date()):string{
 return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-')
}
