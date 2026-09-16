import React from 'react';
import '../../src/App';
import '../../src/index.css';
import {createRoot} from 'react-dom/client';
import ESSSafetyPage from '../../src/components/ESSSafetyPage';
import ProjectDataRegisterPage from '../../src/components/ProjectDataRegisterPage';
import {usersAPI, safetyFilesAPI, safetyProjectsAPI, handoverCertificatesAPI, scaffTagsAPI, scaffTagQrLabelsAPI, dayLabourVariationsAPI, preStartsAPI} from '../../src/services/api';
const registerType = new URLSearchParams(location.search).get('type') || 'handovers';
const builders = [
 {id:'alpha',name:'Alpha Builder',logoUrl:'/scaffold-forms/logo.png',projects:[{id:'north',name:'North Site'},{id:'south',name:'South Site'}]},
 {id:'beta',name:'Beta Builder',projects:[{id:'west',name:'West Site'}]},
 {id:'empty',name:'Empty Builder',projects:[]},
];
safetyProjectsAPI.getBuilders = async () => {
 if (new URLSearchParams(location.search).has('slow-load')) await new Promise(resolve => setTimeout(resolve, 700));
 return builders;
};
usersAPI.getNotificationRecipients = async () => [{id:'fixture-user',fullName:'Fixture Inspector',profileImageUrl:'/scaffold-forms/logo.png'}];
safetyProjectsAPI.resolveBuilderLogoUrl = async () => '/scaffold-forms/logo.png';
let forms = builders.flatMap(builder => builder.projects.map(project => ({
 id:'shared-form-id', builderId:builder.id,projectId:project.id,
 formReferenceName:`${project.name} form`,subject:`${project.name} form`,
 inspectionNumber:project.id,preStartNumber:project.id,variationNumber:project.id,scaffoldNo:project.id,
 jobLocation:project.name,inspectionDateTime:'11/09/2026',date:'11/09/2026',latestInspectionDate:'11/09/2026',
 inspectedBy:'Fixture Inspector',inspectionRecords:[],pdfPath:`${project.id}.pdf`,
})));
if (new URLSearchParams(location.search).has('many-forms')) {
 forms = forms.flatMap(form => Array.from({length: 6}, (_, index) => ({
  ...form, id: `${form.id}-${index}`, formReferenceName: `${form.formReferenceName} ${index + 1}`,
  subject: `${form.subject} ${index + 1}`, updatedAt: `2026-09-${String(10 + index).padStart(2, '0')}T09:00:00Z`,
 })));
}
window.__scopeActions = [];
for (const api of [handoverCertificatesAPI,scaffTagsAPI,dayLabourVariationsAPI,preStartsAPI]) {
 api.listAllForms = async () => forms;
 api.listForms = async (builderId,projectId) => forms.filter(form=>form.builderId===builderId && form.projectId===projectId);
 api.getForm = async (builderId,projectId,id) => {
  window.__scopeActions.push({action:'get',builderId,projectId,id});
  return forms.find(form=>form.builderId===builderId && form.projectId===projectId && form.id===id);
 };
 api.deleteForm = async (builderId,projectId,id) => {
  window.__scopeActions.push({action:'delete',builderId,projectId,id});
  forms = forms.filter(form=>!(form.builderId===builderId && form.projectId===projectId && form.id===id));
 };
 api.getPdfUrl = async form => '/fixture/'+form.projectId+'.pdf';
}
scaffTagQrLabelsAPI.list = async () => [];
safetyFilesAPI.listModuleFiles = async (builderId,projectId,kind) => [{name: `${projectId}-${kind}.pdf`,path:`${builderId}/${projectId}/${kind}.pdf`,updatedAt:'2026-09-11T00:00:00Z'}];
safetyFilesAPI.getSignedModuleFileUrl = async path => '/fixture/'+path;
safetyFilesAPI.deleteModuleFile = async path => {window.__scopeActions.push({action:'delete-file',path});};
createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('project-data') ? <ESSSafetyPage /> : <ProjectDataRegisterPage registerType={registerType} />);
