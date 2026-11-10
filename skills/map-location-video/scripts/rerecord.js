// GHI LẠI video khi ST.late lớn hoặc file nhỏ bất thường. Chạy trong cùng tab sau part-b (tile đã nằm trong bộ nhớ).
// Nếu số cảnh khác 4, đặt window.RECORD_SECONDS = 3.5 + 5.5*N + 3.5 trước khi chạy.
// Xong thì window.REC2 = {blob, url, elapsed, late}; đọc window.ST2.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const FPS=30;
const stage=document.getElementById('stage');stage.innerHTML='';
window.CVS.style.cssText='max-height:86vh;max-width:96vw;background:#000';stage.appendChild(window.CVS);
window.ST2={phase:'start'};
window.JOB2=(async()=>{try{
  const cv=window.CVS;const stream=cv.captureStream(FPS);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8e6});const chunks=[];
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(r=>rec.onstop=r);
  rec.start(250);const N=Math.round((window.RECORD_SECONDS||29)*FPS),t0=performance.now();let late=0;
  for(let i=0;i<N;i++){window.RENDER(i/FPS);const wait=t0+(i+1)*1000/FPS-performance.now();if(wait>0)await sleep(wait);else{late++;await sleep(0);}}
  await sleep(400);rec.stop();await done;
  const blob=new Blob(chunks,{type:'video/webm'});
  window.REC2={blob,url:URL.createObjectURL(blob),elapsed:(performance.now()-t0)/1000,late};
  window.ST2={phase:'done',size:blob.size,elapsed:window.REC2.elapsed,late};
}catch(e){window.ST2={phase:'err',err:String(e&&e.stack||e)};}})();
'started'
