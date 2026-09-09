import React from 'react';
import '../../src/App';
import '../../src/index.css';
import nativeAPI from '../../src/scaffoldForms/services/apiService';
import {createRoot} from 'react-dom/client';
import ScaffoldRegisterPage from '../../src/components/ScaffoldRegisterPage';
import {safetyProjectsAPI, scaffoldRegisterAPI, scaffTagsAPI, handoverCertificatesAPI, foldersAPI} from '../../src/services/api';
const builders = [{id:'builder-test', name:'Test Builder', projects:[{id:'project-test', name:'Test Project', designFolderId:'design-folder', scaffoldEntity:new URLSearchParams(location.search).get('entity') || 'Erect Safe Scaffolding'}]}];
window.registryReads = 0;
safetyProjectsAPI.getBuilders = async () => { window.registryReads++; return builders; };
safetyProjectsAPI.resolveBuilderLogoUrl = async () => '';
for (const [api, type, method] of [[scaffoldRegisterAPI, 'scaffold-register', 'listRecords'], [scaffTagsAPI, 'scaff-tags', 'listForms'], [handoverCertificatesAPI, 'handover-certificates', 'listForms']]) {
 api[method] = async () => (await fetch('/fixture/forms?type='+type)).json();
}
foldersAPI.getFolder = async () => ({id:'design-folder',name:'Designs',subFolders:[],documents:[{id:'design-1',fileType:'ess',essDesignIssuePath:'design/test.pdf',essDesignIssueName:'D-100 REV A',revisionNumber:'A',folderId:'design-folder'}]});
nativeAPI.getFolder = foldersAPI.getFolder;
createRoot(document.getElementById('root')).render(<ScaffoldRegisterPage initialBuilderId="builder-test" initialProjectId="project-test" />);
