import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {parseGtXml} from './gtzip-xml.mjs';
import {generateHtml} from './gtzip-render.mjs';
test('existing GTZIP renderer updates a named text object without replacing its style',()=>{
 const html=generateHtml(parseGtXml('<Composition Width="640" Height="360"><TextBlock Name="Headline" Dimensions="300,50,0" Location="20,20,0" Text="Initial" FontSize="28"/></Composition>'));
 const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
 const el={dataset:{fieldName:'Headline'},style:{color:'#ffffff'},classList:{contains:()=>false},textContent:'Initial'};
 const root={style:{}};const context={window:{addEventListener(){}},document:{querySelectorAll:selector=>selector==='[data-field-name]'?[el]:[],getElementById:()=>root,querySelector:()=>null},setInterval(){}};
 runInNewContext(source,context);context.window.GC.update({Headline:'Updated'});
 assert.equal(el.textContent,'Updated');assert.equal(el.style.color,'#ffffff');
 context.window.GC.update({Other:'Ignored'});assert.equal(el.textContent,'Updated');
});


test('existing object named HeadlineColor is not interpreted as another object color',()=>{
 const xml='<Composition Width="640" Height="360">'+['Headline','HeadlineColor'].map(name=>'<TextBlock Name="'+name+'" Dimensions="300,50,0" Location="20,20,0" Text="Initial" FontSize="28"/>').join('')+'</Composition>';
 const html=generateHtml(parseGtXml(xml)),source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
 const elements=['Headline','HeadlineColor'].map(fieldName=>({dataset:{fieldName},style:{color:'#ffffff'},classList:{contains:name=>name==='gt-text'},textContent:'Initial'}));
 const context={window:{addEventListener(){}},document:{querySelectorAll:s=>s==='[data-field-name]'?elements:[],getElementById:()=>({style:{}}),querySelector:()=>null},setInterval(){}};
 runInNewContext(source,context);context.window.GC.update({HeadlineColor:'#123456'});
 assert.equal(elements[0].style.color,'#ffffff');assert.equal(elements[1].textContent,'#123456');
});
