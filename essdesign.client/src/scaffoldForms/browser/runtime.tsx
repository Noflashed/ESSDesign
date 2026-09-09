import React from 'react';
import * as Native from 'react-native-web';
export * from 'react-native-web';
// React Native Web's Alert is a no-op. Preserve every iOS action, including photo choices.
export const Alert = { alert(title, message = '', buttons = [{text: 'OK'}]) {
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

// UIScrollView pinch zoom has no web implementation. Preserve the native page
// canvas and add browser zoom controls and scrolling around it.
export const ScrollView = React.forwardRef(function BrowserScrollView(props, ref) {
 const [zoom, setZoom] = React.useState(1);
 if (!props.maximumZoomScale) return <Native.ScrollView {...props} ref={ref} />;
 const canvas = Native.StyleSheet.flatten(props.contentContainerStyle) || {};
 const width = Number(canvas.width) || 1, height = Number(canvas.height) || 1;
 return <Native.View style={props.style} testID={props.testID}>
  <div style={{position:'absolute', inset:0, overflow:'auto'}}>
   <div style={{minWidth:'100%', minHeight:'100%', width:'max-content', display:'flex', justifyContent:'center', alignItems:'center'}}>
    <div style={{position:'relative', flexShrink:0, width:width*zoom, height:height*zoom}}>
     <div style={{width, height, transform:`scale(${zoom})`, transformOrigin:'top left'}}>{props.children}</div>
    </div>
   </div>
  </div>
  <div className="scaffold-page-zoom" role="group" aria-label="Page zoom">
   <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button>
   <button type="button" aria-label="Fit page" onClick={() => setZoom(1)}>{Math.round(zoom*100)}%</button>
   <button type="button" aria-label="Zoom in" disabled={zoom >= props.maximumZoomScale} onClick={() => setZoom(value => Math.min(props.maximumZoomScale, value + .5))}>+</button>
  </div>
 </Native.View>;
});
