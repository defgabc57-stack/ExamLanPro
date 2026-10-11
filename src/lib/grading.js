// Pure scoring functions: never import server DB here; can test with node --test.
export const CAUSE_CODES=['both_correct_connected','both_correct_not_connected','statement_correct_reason_wrong','statement_wrong_reason_correct','both_wrong'];
export function gradeOne(question, answer){
 const opts=question.options||[];const type=question.type||'mc';
 if(type==='scaled'){
  const a=Number(answer);const max=Math.max(0,...opts.map(x=>Number(x.score)||0));const earned=Number.isInteger(a)&&opts[a]?Math.max(0,Number(opts[a].score)||0):0;
  return {correct:earned>=max/2&&max>0,earned,max};
 }
 if(type==='complex'){
  const expected=[...(question.answers||[])].map(Number).sort((a,b)=>a-b);
  const actual=Array.isArray(answer)?[...new Set(answer.map(Number))].sort((a,b)=>a-b):[];
  return {correct:expected.length===actual.length&&expected.every((x,i)=>x===actual[i]),earned:0,max:1};
 }
 if(type==='cause_effect')return {correct:String(answer)===String(question.answer),earned:0,max:1};
 return {correct:Number.isInteger(answer)&&Number(answer)===Number(question.answer),earned:0,max:1};
}
// Each question contributes equally (scaled normalized per-item, others binary).
// Historical bug (mixed scaled ignores MC) is intentionally fixed; original scores are never recalculated.
export function gradeExam(questions,answers){
 let correct=0,points=0;const breakdown=[];
 for(let i=0;i<questions.length;i++){
  const q=questions[i],a=answers[i]??null,res=gradeOne(q,a);if(res.correct)correct++;
  points+=q.type==='scaled'?(res.max?res.earned/res.max:0):(res.correct?1:0);
  breakdown.push({position:i,correct:res.correct,answer:a,question:q});
 }
 return {score:questions.length?Math.round(points/questions.length*100):0,correct_count:correct,wrong_count:questions.length-correct,breakdown};
}
export function publicQuestion(q,position,order){const indices=order||q.options?.map((_,i)=>i)||[];return {position,type:q.type,question:q.question||'',statement:q.statement||'',reason:q.reason||'',passage:q.passage||'',image:q.image||'',options:indices.map(i=>({text:q.options[i]?.text||''}))}}
export function normalizeAnswer(question,answer,order){
 if(question.type==='cause_effect')return String(answer??'');
 if(question.type==='complex')return Array.isArray(answer)?[...new Set(answer)].filter(n=>Number.isInteger(n)&&n>=0&&n<order.length).map(i=>order[i]):[];
 if(answer===null||answer===undefined||answer==='')return null;
 const n=Number(answer);return Number.isInteger(n)&&n>=0&&n<order.length?order[n]:null;
}
