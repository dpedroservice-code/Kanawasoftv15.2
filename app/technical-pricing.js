(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KanawaTechnicalPricing=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const n=v=>{const x=Number(v);return Number.isFinite(x)&&x>=0?x:0;};
  const cents=v=>Math.round((v+Number.EPSILON)*100)/100;
  function calculate(input){
    const x=input||{};
    const hours=n(x.hours), hourlyCost=n(x.hourlyCost), hourlyPrice=n(x.hourlyPrice);
    const laborRevenue=cents(hours*hourlyPrice);
    const laborCost=cents(hours*hourlyCost);
    const equipment=cents(n(x.equipment)), consumables=cents(n(x.consumables));
    const travel=cents(n(x.travel)), perDiem=cents(n(x.perDiem));
    const direct=cents(laborRevenue+equipment+consumables);
    const indirect=cents(travel+perDiem);
    const bdiPct=Math.min(1000,n(x.bdiPct)), discount=cents(n(x.discount));
    const contingency=cents((direct+indirect)*bdiPct/100);
    const gross=cents(direct+indirect+contingency);
    const appliedDiscount=Math.min(discount,gross);
    const taxBase=cents(Math.max(0,gross-appliedDiscount));
    const ivaPct=Math.min(100,n(x.ivaPct)), retentionPct=Math.min(100,n(x.retentionPct));
    const iva=cents(taxBase*ivaPct/100);
    const retention=cents(taxBase*retentionPct/100);
    const total=cents(Math.max(0,taxBase+iva-retention));
    const estimatedInternalCost=cents(laborCost+equipment+consumables+travel+perDiem);
    return {laborRevenue,laborCost,equipment,consumables,travel,perDiem,direct,indirect,bdiPct,contingency,gross,discount:appliedDiscount,taxBase,ivaPct,iva,retentionPct,retention,total,estimatedInternalCost,estimatedMargin:cents(total-estimatedInternalCost)};
  }
  return Object.freeze({calculate});
});
