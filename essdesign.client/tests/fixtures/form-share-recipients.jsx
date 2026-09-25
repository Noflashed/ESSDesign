import React from 'react';
import {createRoot} from 'react-dom/client';
import ProjectDataFormShareModal from '../../src/scaffoldForms/components/ProjectDataFormShareModal';
import {getTheme} from '../../src/scaffoldForms/theme/appTheme';
const entity = new URLSearchParams(location.search).get('entity') || 'ess';
window.shareSelections = [];
const record = selection => window.shareSelections.push(selection);
createRoot(document.getElementById('root')).render(
 <ProjectDataFormShareModal visible theme={getTheme('light')} title="Test form" companyEntityId={entity}
  recipients={[{id:'safety',fullName:'Duplicate Safety Account',email:entity==='maloo'?'SAFETY@MALOOACCESS.COM.AU':'SAFETY@ERECTSAFE.COM.AU'}]}
  loadingRecipients={false} sharing={false} onClose={()=>{}} onShare={record} onEmailAttachment={record} />
);
