(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.KanawaAngolaTax=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REGIMES=Object.freeze({
    geral:{rate:14,code:'IVA_GERAL'},
    simplificado:{rate:7,code:'IVA_SIMPLIFICADO'},
    isento:{rate:0,code:'IVA_ISENTO'}
  });
  const DOCUMENT_TYPES=Object.freeze({
    FT:{label:'Factura',fiscal:true},
    FR:{label:'Factura-Recibo',fiscal:true},
    FS:{label:'Factura Simplificada',fiscal:true},
    ND:{label:'Nota de Débito',fiscal:true},
    NC:{label:'Nota de Crédito',fiscal:true},
    FP:{label:'Factura Pró-forma',fiscal:false}
  });
  function amount(value,name){
    const n=Number(value);
    if(!Number.isFinite(n)||n<0) throw new Error((name||'Valor')+' inválido.');
    return Math.round((n+Number.EPSILON)*100)/100;
  }
  function calculate(input){
    const x=input||{};
    const base=amount(x.base,'Base tributável');
    const regime=String(x.regime||'geral');
    const profile=REGIMES[regime];
    if(!profile) throw new Error('Regime fiscal não reconhecido.');
    const applyVat=x.applyVat!==false;
    const reason=String(x.exemptionReason||'').trim();
    if(applyVat&&regime==='isento'&&reason.length<5)
      throw new Error('A isenção exige o motivo e o fundamento legal antes de concluir a venda.');
    if(regime!=='isento'&&reason)
      throw new Error('O fundamento de isenção só pode ser indicado no regime isento.');
    const rate=applyVat?profile.rate:0;
    const vatAmount=amount(base*rate/100,'IVA');
    return Object.freeze({base,regime,rate,vatAmount,total:amount(base+vatAmount,'Total'),exemptionReason:regime==='isento'?reason:'',taxCode:profile.code});
  }
  function documentType(code){
    const key=String(code||'').trim().toUpperCase();
    if(!DOCUMENT_TYPES[key]) throw new Error('Tipo de documento não suportado.');
    return Object.freeze({code:key,...DOCUMENT_TYPES[key]});
  }
  function calculateWithholding(input){
    const x=input||{};
    if(x.applicable!==true) return Object.freeze({applicable:false,rate:0,amount:0,legalBasis:''});
    const category=String(x.category||'').trim().toLowerCase();
    const legalBasis=String(x.legalBasis||'').trim();
    if(category!=='service') throw new Error('A retenção na fonte configurada por este motor aplica-se apenas a operações classificadas como serviços.');
    if(legalBasis.length<5) throw new Error('A retenção exige enquadramento e fundamento legal.');
    const rate=Number(x.rate);
    if(!Number.isFinite(rate)||rate<=0||rate>100) throw new Error('Taxa de retenção inválida.');
    const base=amount(x.base,'Base da retenção');
    return Object.freeze({applicable:true,rate,amount:amount(base*rate/100,'Retenção'),legalBasis});
  }
  return Object.freeze({REGIMES,DOCUMENT_TYPES,calculate,documentType,calculateWithholding});
});
