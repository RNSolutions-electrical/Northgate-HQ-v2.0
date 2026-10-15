import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[],entries:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {EstimateDirectory}=await server.ssrLoadModule('/src/modules/estimates/workbench/EstimateDirectory.jsx');
 const row={personal_id:'personal',document:{name:'Fixture'},estimates:{status:'promoted'},promotion:{state:'archived',division:'Electrical'}};
 let html=renderToStaticMarkup(React.createElement(EstimateDirectory,{rows:[row],personalMode:true,onArchive:()=>{}}));
 assert.match(html,/Official estimate archived/);assert.match(html,/Archive personal copy/);assert.doesNotMatch(html,/Archive official estimate/);
 html=renderToStaticMarkup(React.createElement(EstimateDirectory,{rows:[row],personalMode:true,archived:true,onArchive:()=>{}}));
 assert.match(html,/Restore/);assert.match(html,/estimate-directory-row" disabled/);
 html=renderToStaticMarkup(React.createElement(EstimateDirectory,{rows:[{...row,promotion:{state:'unavailable'}}],personalMode:true,onArchive:()=>{}}));
 assert.match(html,/Official estimate unavailable; ask an administrator/);
 html=renderToStaticMarkup(React.createElement(EstimateDirectory,{rows:[{...row,estimates:{status:'submitted'}}],personalMode:true,onArchive:()=>{}}));
 assert.match(html,/disabled="">Archive personal copy/);
 html=renderToStaticMarkup(React.createElement(EstimateDirectory,{rows:[row]}));assert.doesNotMatch(html,/Archive official estimate/);
 console.log('PASS: rendered archive/restore controls, disabled archived opening and pending submission, scoped action visibility, promoted archived/unavailable messages.');
}finally{await server.close();}
