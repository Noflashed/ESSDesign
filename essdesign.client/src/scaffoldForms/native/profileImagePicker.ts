// Normalize selected images to JPEG, matching the native picker and PDF encoders.
export async function pickFormImage(source = 'library') {
 const file = await new Promise<File | null>(resolve => {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
  if (source === 'camera') input.setAttribute('capture', 'environment');
  input.onchange = () => resolve(input.files?.[0] || null);
  input.addEventListener('cancel', () => resolve(null)); input.click();
 });
 if (!file) throw new Error('E_PICKER_CANCELLED');
 const bitmap = await createImageBitmap(file);
 try {
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return {uri: canvas.toDataURL('image/jpeg', .88), fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg'};
 } finally { bitmap.close(); }
}
export const pickProfileImage = pickFormImage;
