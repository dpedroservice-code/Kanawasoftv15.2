const { AsyncLocalStorage } = require('async_hooks');
const tenantContext = new AsyncLocalStorage();
function getContext(){ return tenantContext.getStore() || null; }
function runWithContext(user, fn){ return tenantContext.run({user}, fn); }
function getTenantId(){ const c=getContext(); const id=Number(c&&c.user?c.user.empresa_id:null); return Number.isInteger(id)&&id>0?id:null; }
function tableHasTenantColumn(db, table){ try{ const r=db&&db.db&&db.db.exec?db.db.exec(`PRAGMA table_info(${table})`):null; return !!(r&&r[0]&&r[0].values&&r[0].values.some(x=>String(x[1])==='empresa_id')); }catch(_){ return false; } }
function extractTable(sql){ const s=String(sql||''); const m=s.match(/\b(?:FROM|UPDATE|INTO)\s+([A-Za-z0-9_]+)/i)||s.match(/\bDELETE\s+FROM\s+([A-Za-z0-9_]+)/i); return m?m[1]:null; }
function whereHasTenant(sql){ const w=String(sql||'').match(/\bWHERE\b([\s\S]*)$/i); return !!(w&&/\bempresa_id\s*(?:=|IN|IS)\b/i.test(w[1])); }
function secure(db,sql,params){
  const tenantId=getTenantId(); if(!tenantId)return {sql,params};
  const table=extractTable(sql); if(!table||!tableHasTenantColumn(db,table))return {sql,params};
  const s=String(sql).trim();
  if(/^SELECT\b/i.test(s)){
    if(whereHasTenant(s))return {sql:s,params};
    const w=s.match(/\bWHERE\b/i); if(w){const p=w.index+w[0].length;return {sql:s.slice(0,p)+' empresa_id = ? AND'+s.slice(p),params:[tenantId,...params]};}
    const at=[s.search(/\bORDER\s+BY\b/i),s.search(/\bLIMIT\b/i),s.search(/\bOFFSET\b/i)].filter(x=>x>=0); const p=at.length?Math.min(...at):s.length;
    return {sql:s.slice(0,p)+' WHERE empresa_id = ? '+s.slice(p),params:[tenantId,...params]};
  }
  if(/^INSERT\b/i.test(s)){
    const m=s.match(/^\s*INSERT\s+INTO\s+[^\s(]+\s*\(([^)]+)\)/i); if(!m)return {sql:s,params};
    const cols=m[1].split(',').map(x=>x.trim().replace(/["`]/g,'').toLowerCase()); const i=cols.indexOf('empresa_id');
    if(i>=0){const p=[...params];p[i]=tenantId;return {sql:s,params:p};}
    return {sql:s.slice(0,m[0].length-1)+', empresa_id)'+s.slice(m[0].length),params:[...params,tenantId]};
  }
  if(/^UPDATE\b/i.test(s)){
    let sqlOut=s; const p=[...params]; const setMatch=s.match(/^\s*UPDATE\s+[^\s]+\s+SET\s+([\s\S]*?)(?:\s+WHERE\s+|$)/i);
    if(setMatch){
      const setStart=setMatch.index+setMatch[0].indexOf(setMatch[1]);
      const rewritten=setMatch[1].split(',').map((part,idx)=>{if(/^\s*empresa_id\s*=/i.test(part)){const eq=part.indexOf('=');p[idx]=tenantId;return part.slice(0,eq+1)+' ?';}return part;}).join(',');
      sqlOut=s.slice(0,setStart)+rewritten+s.slice(setStart+setMatch[1].length);
    }
    if(!whereHasTenant(sqlOut)){const w=sqlOut.search(/\bWHERE\b/i);if(w>=0){const pos=w+5;sqlOut=sqlOut.slice(0,pos)+' empresa_id = ? AND'+sqlOut.slice(pos);p.push(tenantId);}else{sqlOut+=' WHERE empresa_id = ?';p.push(tenantId);}}
    return {sql:sqlOut,params:p};
  }
  if(/^DELETE\b/i.test(s)){
    if(whereHasTenant(s))return {sql:s,params}; const w=s.search(/\bWHERE\b/i); if(w>=0){const pos=w+5;return {sql:s.slice(0,pos)+' empresa_id = ? AND'+s.slice(pos),params:[...params,tenantId]};}
    return {sql:s+' WHERE empresa_id = ?',params:[...params,tenantId]};
  }
  return {sql:s,params};
}
function createTenantDB(db){return new Proxy(db,{get(target,property,receiver){const original=Reflect.get(target,property,receiver);if(!['get','all','run'].includes(property)||typeof original!=='function')return original;return function(sql,params=[]){const x=secure(target,sql,Array.isArray(params)?params:[]);return original.call(target,x.sql,x.params);};}});}
function tenantContextMiddleware(req,res,next){if(!req.user)return next();if(!req.user.empresa_id)return res.status(403).json({error:'Utilizador sem empresa associada'});return runWithContext(req.user,next);}
module.exports={createTenantDB,tenantContextMiddleware,getContext,getTenantId};
