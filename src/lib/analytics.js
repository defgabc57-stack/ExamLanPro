import {hash,j} from './util.js';

export function questionStatistics(rows) {
  const groups=new Map();
  for(const row of rows) {
    const q=j(row.question_snapshot_json,{});
    // Snapshot includes the original option order and question ID/version.
    const key=row.quiz_id+':'+hash(JSON.stringify(q));
    if(!groups.has(key)) groups.set(key,{
      key,quizId:row.quiz_id,quiz:row.quiz,
      label:Number.isInteger(q.displayOrder)?'No. '+(q.displayOrder+1):'Soal #'+(q.id??key.slice(-8)),
      question:q.question||q.statement||'',correct:0,total:0,
    });
    const group=groups.get(key);group.total++;group.correct+=Number(row.is_correct)?1:0;
  }
  return [...groups.values()];
}
