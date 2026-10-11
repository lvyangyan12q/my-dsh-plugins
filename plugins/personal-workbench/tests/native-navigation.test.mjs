import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Workbench} from '../src/workbench.ts';
import {PanelNavigation,bindWorkbenchPanel} from '../src/panel-navigation.ts';
const PANEL='personal-workbench';
function layoutFixture(){
 let active=null;let controller=new AbortController();const listeners=new Set();
 return{
  get active(){return active},set active(value){active=value},
  panelInfo:{getSnapshot:()=>({activePanelId:active}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}},
  selectPanel(id){active=id;for(const fn of [...listeners])fn()},
  beginNavigation(){controller.abort();controller=new AbortController();return controller.signal},
 };
}
test('the workbench follows the native main panel and management overlays dismiss on native navigation',()=>{
 const layout=layoutFixture();
 const wb=new Workbench(),panels=new PanelNavigation();
 const binding=bindWorkbenchPanel(layout,wb,panels,PANEL);
 wb.registerApp({id:'learning',name:'Learning',version:'1',source:'test',icon:'book-open',pages:[{id:'lesson',label:'Lesson'}],defaultLayout:{width:600,height:400,pageId:'lesson'}});
 wb.openApp('learning');
 assert.equal(layout.active,PANEL,'opening an application selects the native main panel');
 assert.equal(wb.getSnapshot().visible,true);
 const identity=wb.getSnapshot().windows[0];
 layout.selectPanel('plugins');
 assert.equal(wb.getSnapshot().visible,false,'selecting another native panel hides the workbench overlay state');
 assert.equal(layout.active,'plugins');
 assert.equal(wb.getSnapshot().windows[0],identity,'the window registration survives a native panel switch');
 layout.selectPanel(PANEL);
 assert.equal(wb.getSnapshot().visible,true,'selecting the workbench panel shows it again');
 assert.equal(wb.getSnapshot().focused,'["learning","default"]','re-selecting the panel must not reset the focused window');
 panels.open('agents');assert.equal(panels.getSnapshot().panel,'agents');
 layout.beginNavigation();assert.equal(panels.getSnapshot().panel,null,'native navigation dismisses the management overlay');
 binding.dispose();wb.dispose();panels.dispose();
});
test('a boot selection attempted before the panel is registered does not throw and is retried by resync',()=>{
 const registered=new Set();
 const layout=layoutFixture();
 const selectPanel=layout.selectPanel;
 // Reject the unregistered key exactly as the public ILayout contract does.
 layout.selectPanel=id=>{if(id!==null&&!registered.has(id))throw new Error('unregistered main panel');selectPanel(id)};
 const wb=new Workbench({getItem:()=>JSON.stringify({version:1,focused:null,visible:true,windows:[],apps:{}}),setItem:()=>{}}),panels=new PanelNavigation();
 let binding
 assert.doesNotThrow(()=>{binding=bindWorkbenchPanel(layout,wb,panels,PANEL)},'a boot selection before registration must not throw');
 assert.equal(layout.active,null,'no panel is selected while the key is unregistered');
 registered.add(PANEL);
 binding.resync();
 assert.equal(layout.active,PANEL,'resync selects the workbench panel once it is registered');
 binding.dispose();wb.dispose();panels.dispose();
});
