// Resume from the highest stored revision; avoid depending on the client's clock.
export function nextRevision(current,serverRevision=0) {
  const next=Math.max(Number(current)||0,Number(serverRevision)||0)+1;
  if (!Number.isSafeInteger(next)) throw new Error('Revisi jawaban melampaui batas');
  return next;
}
