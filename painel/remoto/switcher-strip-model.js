// Surface state only: Delegate and Bank never change the production graph.
export function stripInputs(inputs,{page=0,size=8,category=''}={}){
 if(!Number.isInteger(size)||size<1||size>16||!Number.isInteger(page)||page<0)throw Error('Banco inválido');
 const rows=category?inputs.filter(i=>i.tags?.includes(category)):inputs;
 return rows.slice(page*size,(page+1)*size);
}
export function stripMix(snapshot,mixId){
 if(![1,2,3,4].includes(mixId))throw Error('Delegate inválido');
 return snapshot.mixes?.find(m=>m.mixId===mixId)||null;
}
export function changeDelegate(surface,mixId){
 if(![1,2,3,4].includes(mixId))throw Error('Delegate inválido');
 return {...surface,mixId};
}
