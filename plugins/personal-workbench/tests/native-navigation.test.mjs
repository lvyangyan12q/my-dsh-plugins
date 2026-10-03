import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Workbench} from '../src/workbench.ts';
import {PanelNavigation,bridgeNativeNavigation} from '../src/panel-navigation.ts';
test('native global menus and session navigation dismiss plugin panels without losing registered owners',()=>{
 let controller=new AbortController(),selected=null;
 const layout={selectPanel(id){selected=id;controller.abort()},beginNavigation(){controller.abort();controller=new AbortController();return controller.signal}};
 const wb=new Workbench(),panels=new PanelNavigation();
 const remove=bridgeNativeNavigation(layout,wb,panels);
 wb.registerApp({id:'learning',name:'Learning',version:'1',source:'test',icon:'book-open',pages:[{id:'lesson',label:'Lesson'}],defaultLayout:{width:600,height:400,pageId:'lesson'}});
 wb.openApp('learning');assert.equal(wb.getSnapshot().visible,true);
 const identity=wb.getSnapshot().windows[0];
 layout.selectPanel('plugins');assert.equal(wb.getSnapshot().visible,false);assert.equal(selected,'plugins');assert.equal(wb.getSnapshot().windows[0],identity);
 panels.open('agents');assert.equal(panels.getSnapshot().panel,'agents');
 layout.beginNavigation();assert.equal(panels.getSnapshot().panel,null);
 wb.openApp('learning');assert.equal(wb.getSnapshot().windows.length,1);assert.equal(wb.getSnapshot().visible,true);
 remove();wb.dispose();panels.dispose();
});
