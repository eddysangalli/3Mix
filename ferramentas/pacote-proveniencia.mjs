// Removes host-specific locations without inventing a public provenance claim.
export function metadataForDistribution(value){
 if(Array.isArray(value))return value.map(metadataForDistribution);
 if(value&&typeof value==='object'){
  const result={};for(const [key,item] of Object.entries(value)){
   if(typeof item==='string'&&(Array.from(item).some((c,i)=>/[A-Za-z]/.test(c)&&(i===0||!/[A-Za-z0-9]/.test(item[i-1]))&&item[i+1]===':'&&[47,92].includes(item.charCodeAt(i+2)))||item.startsWith(String.fromCharCode(92,92)))){
    result[key]='Local build/archive location omitted from distribution';
    result[key+'LocationRedacted']=true;
   }else result[key]=metadataForDistribution(item);
  }return result;
 }return value;
}
