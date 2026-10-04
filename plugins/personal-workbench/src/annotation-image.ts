/** Images stay browser-owned until the user sends the native conversation draft. */
export function validateAnnotationImage(file:File):void {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP screenshot.')
 if(!file.size||file.size>8*1024*1024)throw Error('Screenshot must be nonempty and no larger than 8 MiB.')
}
