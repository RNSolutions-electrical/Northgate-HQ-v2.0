import {calculate} from './worksheetCalculation.js';
import {evaluateGuidedMethods} from './guidedMethodModel.js';
import {evaluateCookingPlan,evaluateCookingClassification} from './cookingMethodModel.js';
import {evaluateSupportedProposals} from './assistedReviewModel.js';
import {inspectCalculationSource} from './nameplateModel.js';
export function wholeMethodProposals(payload,evaluate=evaluateGuidedMethods){
 const result=evaluate(structuredClone(payload),{calculate,inspectSource:inspectCalculationSource,evaluateSupportedProposals,evaluateCookingPlan,evaluateCookingClassification});
 const proposals=[],blockers=[];
 for(const method of ['standard','optional']){const candidate=result[method];if(candidate.status!=='candidate-needs-final-review'){for(const reason of candidate.blockers||[])blockers.push({reason:method+': '+reason});continue;}
 const changes=Object.entries(candidate.changes||{}).map(([target,proposed])=>({target,before:payload[target]??'',proposed:String(proposed),append:target.endsWith('Note')}));
 proposals.push({id:'guided.'+method+'.v2',method,target:'Complete supported method inputs',before:'',proposed:'',wholeMethod:true,changes,totalVA:candidate.value,amps:candidate.engineResult?.[method+'Amps'],ruleId:'NEC2017-guided-'+method,ruleVersion:'2017-nec-nc-guided-v2',reasons:[...(candidate.steps||[]),...(candidate.finalReviewItems||[])],sourceReferences:[],limitations:[...(result.limitations||[]),'Apply appends calculation basis to existing notes and resets review acknowledgments. Final professional review remains required.']});}
 return {proposals,blockers};
}
