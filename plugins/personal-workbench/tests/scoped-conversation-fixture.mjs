// Unit fixture for the public Cordis dependency lease. The separate Cordis
// integration test verifies real guard enforcement and Service tracker scope.
export function scopedConversation(send) {
 return {inject(names,run){if(names.join()!=='conversation')throw new Error('Unexpected dependencies');run({conversation:{send}});return {dispose:async()=>{}}}}
}
