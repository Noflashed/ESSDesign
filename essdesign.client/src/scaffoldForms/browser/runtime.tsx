import React from 'react';
import * as Native from 'react-native-web';
export * from 'react-native-web';
// React Native Web's Alert is a no-op. Preserve every iOS action, including photo choices.
export const Alert = { alert(title, message = '', buttons = [{text: 'OK'}]) {
  // Preserve the original form callbacks, but open the desktop picker in the
  // user's click event instead of showing the native camera/library chooser.
  if (title === 'Add Photo' && message === 'Choose image source') {
    const library = buttons.find(button => button.text === 'Choose Existing');
    if (library?.onPress) { library.onPress(); return; }
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'scaffold-browser-alert';
  const heading = document.createElement('h2'); heading.textContent = title;
  const body = document.createElement('p'); body.textContent = message;
  const actions = document.createElement('div');
  dialog.append(heading, body, actions);
  const priorFocus = document.activeElement;
  const close = () => { dialog.close(); dialog.remove(); priorFocus?.focus?.(); };
  buttons.forEach(button => {
    const element = document.createElement('button');
    element.textContent = button.text || 'OK';
    element.type = 'button';
    element.onclick = () => { close(); button.onPress?.(); };
    actions.append(element);
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); buttons.find(b => b.style === 'cancel')?.onPress?.(); });
  document.body.append(dialog); dialog.showModal();
}};

// SignaturePadModal is the sole PanResponder consumer in these shared forms.
// Capture the canvas itself before drawing removes the initial placeholder.
export const PanResponder = {create(callbacks) {
 let pointerId: number | null = null;
 const pointEvent = event => {
  const canvas = event.currentTarget;
  const bounds = canvas.getBoundingClientRect();
  return {nativeEvent: {
   locationX: (event.clientX - bounds.left) * canvas.offsetWidth / Math.max(bounds.width, 1),
   locationY: (event.clientY - bounds.top) * canvas.offsetHeight / Math.max(bounds.height, 1)
  }};
 };
 const finish = (event, cancelled = false) => {
  if (event.pointerId !== pointerId) return;
  pointerId = null;
  if (cancelled) callbacks.onPanResponderTerminate?.(pointEvent(event));
  else callbacks.onPanResponderRelease?.(pointEvent(event));
 };
 return {panHandlers: {
  onPointerDown(event) {
   if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
   event.preventDefault();
   event.stopPropagation();
   pointerId = event.pointerId;
   event.currentTarget.setPointerCapture(pointerId);
   callbacks.onPanResponderGrant?.(pointEvent(event));
  },
  onPointerMove(event) {
   if (event.pointerId !== pointerId) return;
   event.preventDefault();
   callbacks.onPanResponderMove?.(pointEvent(event));
  },
  onPointerUp: event => finish(event),
  onPointerCancel: event => finish(event, true),
  onLostPointerCapture: event => finish(event, true)
 }};
}};

// Route browser zoom gestures to the document canvas, preserving the editor chrome.
function ZoomableScrollView(props) {
 const [zoom, setZoom] = React.useState(1);
 const viewportRef = React.useRef<HTMLDivElement>(null);
 const canvasRef = React.useRef<HTMLDivElement>(null);
 const zoomRef = React.useRef(1);
 const targetZoomRef = React.useRef(1);
 const animationRef = React.useRef(0);
 const anchorRef = React.useRef<any>(null);
 const minZoom = props.minimumZoomScale || 1;
 const maxZoom = props.maximumZoomScale;
 const changeZoom = React.useCallback((value, clientX?, clientY?) => {
  const viewport = viewportRef.current, sheet = canvasRef.current;
  if (!viewport || !sheet) return;
  const next = Math.max(minZoom, Math.min(maxZoom, value));
  cancelAnimationFrame(animationRef.current);
  targetZoomRef.current = next;
  if (next === zoomRef.current) return;
  const bounds = viewport.getBoundingClientRect(), page = sheet.getBoundingClientRect();
  const x = clientX ?? bounds.left + viewport.clientWidth / 2;
  const y = clientY ?? bounds.top + viewport.clientHeight / 2;
  const anchor = {x: x - bounds.left, y: y - bounds.top,
   pageX: (x - page.left) / zoomRef.current, pageY: (y - page.top) / zoomRef.current};
  const from = zoomRef.current, started = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = (now) => {
   const progress = reducedMotion ? 1 : Math.min(1, (now - started) / 160);
   const value = from + (next - from) * (1 - Math.pow(1 - progress, 3));
   anchorRef.current = anchor;
   zoomRef.current = value;
   setZoom(value);
   if (progress < 1) animationRef.current = requestAnimationFrame(animate);
  };
  if (reducedMotion) animate(started);
  else animationRef.current = requestAnimationFrame(animate);
 }, [minZoom, maxZoom]);

 React.useEffect(() => () => cancelAnimationFrame(animationRef.current), []);

 React.useLayoutEffect(() => {
  const anchor = anchorRef.current, viewport = viewportRef.current, sheet = canvasRef.current;
  if (!anchor || !viewport || !sheet) return;
  const bounds = viewport.getBoundingClientRect(), page = sheet.getBoundingClientRect();
  viewport.scrollLeft += page.left - bounds.left + anchor.pageX * zoom - anchor.x;
  viewport.scrollTop += page.top - bounds.top + anchor.pageY * zoom - anchor.y;
  anchorRef.current = null;
 }, [zoom]);

 React.useEffect(() => {
  const viewport = viewportRef.current;
  if (!viewport) return;
  const wheel = event => {
   if (!event.ctrlKey && !event.metaKey) return;
   event.preventDefault();
   const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
   changeZoom(targetZoomRef.current * Math.exp(-pixels * .003), event.clientX, event.clientY);
  };
  const keydown = event => {
   if ((!event.ctrlKey && !event.metaKey) || event.altKey || !['+', '=', '-', '0'].includes(event.key)) return;
   // Multiple handover pages (and hidden editors) can be mounted simultaneously.
   const visible = Array.from(document.querySelectorAll<HTMLElement>('.scaffold-zoom-viewport')).filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
   });
   const focused = document.activeElement?.closest('.scaffold-zoom-viewport');
   const active = visible.find(element => element === focused)
    || visible.find(element => element.matches(':hover')) || visible[0];
   if (active !== viewport || document.querySelector('dialog[open]')) return;
   event.preventDefault();
   changeZoom(event.key === '0' ? minZoom : targetZoomRef.current + (event.key === '-' ? -.25 : .25));
  };
  let pinch: {distance: number; zoom: number} | null = null;
  const touchstart = event => {
   if (event.touches.length !== 2) return;
   event.preventDefault();
   const [a, b] = event.touches;
   pinch = {distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: zoomRef.current};
  };
  const touchmove = event => {
   if (!pinch || event.touches.length !== 2) return;
   event.preventDefault();
   const [a, b] = event.touches;
   const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
   if (pinch.distance > 0) changeZoom(pinch.zoom * distance / pinch.distance, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  };
  const touchend = () => { pinch = null; };
  let gestureZoom = 1;
  const gesturestart = event => { event.preventDefault(); gestureZoom = zoomRef.current; };
  const gesturechange = event => { event.preventDefault(); changeZoom(gestureZoom * event.scale, event.clientX, event.clientY); };
  viewport.addEventListener('wheel', wheel, {passive: false});
  viewport.addEventListener('touchstart', touchstart, {passive: false});
  viewport.addEventListener('touchmove', touchmove, {passive: false});
  viewport.addEventListener('touchend', touchend);
  viewport.addEventListener('touchcancel', touchend);
  viewport.addEventListener('gesturestart', gesturestart);
  viewport.addEventListener('gesturechange', gesturechange);
  document.addEventListener('keydown', keydown);
  return () => {
   viewport.removeEventListener('wheel', wheel);
   viewport.removeEventListener('touchstart', touchstart);
   viewport.removeEventListener('touchmove', touchmove);
   viewport.removeEventListener('touchend', touchend);
   viewport.removeEventListener('touchcancel', touchend);
   viewport.removeEventListener('gesturestart', gesturestart);
   viewport.removeEventListener('gesturechange', gesturechange);
   document.removeEventListener('keydown', keydown);
  };
 }, [changeZoom, minZoom]);
 const canvas = Native.StyleSheet.flatten(props.contentContainerStyle) || {};
 const width = Number(canvas.width) || 1, height = Number(canvas.height) || 1;
 return <Native.View style={props.style} testID={props.testID}>
  <div ref={viewportRef} className="scaffold-zoom-viewport" tabIndex={0} aria-label="Zoomable form page"
   style={{position:'absolute', inset:0, overflow:'auto', touchAction:'pan-x pan-y'}}>
   <div style={{minWidth:'100%', minHeight:'100%', width:'max-content', display:'flex', justifyContent:'center', alignItems:'center'}}>
    <div ref={canvasRef} style={{position:'relative', flexShrink:0, width:width*zoom, height:height*zoom}}>
     <div style={{width, height, transform:`scale(${zoom})`, transformOrigin:'top left'}}>{props.children}</div>
    </div>
   </div>
  </div>
  <div className="scaffold-page-zoom" role="group" aria-label="Page zoom">
   <button type="button" aria-label="Zoom out" disabled={zoom <= minZoom} onClick={() => changeZoom(targetZoomRef.current - .5)}>−</button>
   <button type="button" aria-label="Fit page" onClick={() => changeZoom(minZoom)}>{Math.round(zoom*100)}%</button>
   <button type="button" aria-label="Zoom in" disabled={zoom >= maxZoom} onClick={() => changeZoom(targetZoomRef.current + .5)}>+</button>
  </div>
 </Native.View>;
}

export const ScrollView = React.forwardRef(function BrowserScrollView(props, ref) {
 return props.maximumZoomScale ? <ZoomableScrollView {...props} /> : <Native.ScrollView {...props} ref={ref} />;
});
