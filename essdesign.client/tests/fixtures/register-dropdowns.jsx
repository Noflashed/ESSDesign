import React from 'react';
import '../../src/App';
import '../../src/index.css';
import {createRoot} from 'react-dom/client';
import ProjectDataRegisterPage from '../../src/components/ProjectDataRegisterPage';
import {safetyProjectsAPI, handoverCertificatesAPI, scaffTagsAPI, scaffTagQrLabelsAPI, dayLabourVariationsAPI, preStartsAPI} from '../../src/services/api';
const registerType = new URLSearchParams(location.search).get('type') || 'handovers';
const builders = [
 {id:'alpha',name:'Alpha Builder',projects:[{id:'north',name:'North Site'},{id:'south',name:'South Site'}]},
 {id:'beta',name:'Beta Builder',projects:[{id:'west',name:'West Site'}]},
 {id:'empty',name:'Empty Builder',projects:[]},
];
safetyProjectsAPI.getBuilders = async () => builders;
safetyProjectsAPI.resolveBuilderLogoUrl = async () => '/scaffold-forms/logo.png';
const forms = builders.flatMap(builder => builder.projects.map(project => ({
 id:project.id, builderId:builder.id,projectId:project.id,
 formReferenceName:`${project.name} form`,subject:`${project.name} form`,
 inspectionNumber:project.id,preStartNumber:project.id,variationNumber:project.id,scaffoldNo:project.id,
 jobLocation:project.name,inspectionDateTime:'11/09/2026',date:'11/09/2026',latestInspectionDate:'11/09/2026',
 inspectionRecords:[],pdfPath:`${project.id}.pdf`,
})));
for (const api of [handoverCertificatesAPI,scaffTagsAPI,dayLabourVariationsAPI,preStartsAPI]) {
 api.listAllForms = async () => forms;
 api.getPdfUrl = async () => 'about:blank';
}
scaffTagQrLabelsAPI.list = async () => [];
createRoot(document.getElementById('root')).render(<ProjectDataRegisterPage registerType={registerType} />);
