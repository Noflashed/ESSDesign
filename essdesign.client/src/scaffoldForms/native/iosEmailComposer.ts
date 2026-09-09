export async function composeEmailWithPdf({to, subject, body, pdfUrl, fileName}) {
 const response = await fetch(pdfUrl);
 if (!response.ok) throw new Error('Could not download the PDF.');
 const file = new File([await response.blob()], fileName, {type:'application/pdf'});
 if (navigator.canShare?.({files:[file]})) {
  try { await navigator.share({files:[file], title:subject, text:body}); return 'saved'; }
  catch(error) { if (error.name === 'AbortError') return 'cancelled'; throw error; }
 }
 const url = URL.createObjectURL(file);
 const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
 setTimeout(() => URL.revokeObjectURL(url), 60000);
 window.location.href = 'mailto:' + to.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body + '\n\nAttach the PDF downloaded by ESS Design.');
 return 'saved';
}
