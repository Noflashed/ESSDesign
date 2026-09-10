import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

// Load the production renderers in Node without importing the web application.
export async function loadMeasurementRenderers(api, constants) {
 globalThis.__measurementRepair = {api, constants};
 const root = fileURLToPath(new URL('../src/scaffoldForms/', import.meta.url));
 const result = await build({stdin:{contents:`
 export {formatMetres} from './utils/measurements';
 export {getHandoverCertificateForm, getHandoverCertificatePdfUrl, buildHandoverCertificatePdfBody} from './services/supabaseHandoverCertificates';
 export {getDayLabourVariationForm, getDayLabourVariationPdfUrl, buildDayLabourVariationPdfBody} from './services/supabaseDayLabourForms';
 `,resolveDir:root},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'maintenance-runtime',setup(build) {
  build.onResolve({filter:/\/(apiService|constants|runtime|storage)$/}, args=>({path:args.path.split('/').pop(),namespace:'maintenance'}));
  build.onLoad({filter:/.*/,namespace:'maintenance'},args=>({contents: {
   apiService:'export default globalThis.__measurementRepair.api;',
   constants:'export const AppConstants = globalThis.__measurementRepair.constants;',
   runtime:'export const Image = {};',
   storage:'export default {getItem: async () => null};',
  }[args.path]}));
 }}]});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
