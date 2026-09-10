"""Vendor iOS scaffold forms with browser-only import/asset adaptations.
Usage: python3 scripts/sync-ios-scaffold-forms.py /path/to/ESSApp
"""
from pathlib import Path
import sys, re, shutil, json, hashlib
source = Path(sys.argv[1]).resolve()
client = Path(__file__).resolve().parents[1]
dest = client / 'src/scaffoldForms'
files = '''screens/DayLabourVariationFormScreen.tsx screens/HandoverCertificateFormScreen.tsx screens/ScaffTagFormScreen.tsx
components/AppTopBar.tsx components/CompanyEntitySelector.tsx components/SignaturePadModal.tsx
components/ProjectDataFormDemoModal.tsx components/ProjectDataFormShareModal.tsx
components/ScaffoldRecordLinkControls.tsx components/DrawingRegisterPickerModal.tsx
services/supabaseHandoverCertificates.ts services/supabaseScaffTags.ts services/scaffTagPdfRenderer.ts
services/supabaseSafetyRecords.ts services/supabaseScaffTagQrLabels.ts services/supabaseScaffoldRegister.ts
services/supabaseDayLabourForms.ts utils/materialSelection.ts features/materialOrders/requestSchema.ts
theme/appTheme.ts config/companyEntities.ts utils/sydneyTime.ts utils/projectDataEmail.ts
utils/projectDataWorkflowDemoPreference.ts utils/scaffoldRecordMatching.ts utils/scaffTagQrLabelToken.ts
utils/measurements.ts utils/scaffoldLifecycle.ts'''.split()
files += '''screens/PreStartFormScreen.tsx components/PreStartDocumentEditor.tsx
components/ProjectDataDatePicker.tsx models/preStart.ts models/preStartDocument.ts
models/preStartEditorLayout.ts services/supabasePreStarts.ts services/preStartPdfRenderer.ts'''.split()
selected = set(sys.argv[3:]) if len(sys.argv) > 2 and sys.argv[2] == '--only' else set(files)
manifest_path = dest / 'source-manifest.json'
previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
assets = previous.get('assets', {})
source_hashes = previous.get('sha256', {})
for name in files:
    if name not in selected:
        continue
    original = source / 'src' / name
    source_hashes[name] = hashlib.sha256(original.read_bytes()).hexdigest()
    content = original.read_text()
    content = content.replace("from 'react-native'", "from '../browser/runtime'")
    content = content.replace("from 'react-native-vector-icons/Feather'", "from '../browser/Feather'")
    content = content.replace("from 'react-native-safe-area-context'", "from '../browser/safeArea'")
    content = content.replace("from '@react-native-async-storage/async-storage'", "from '../browser/storage'")
    def asset(match):
        path = (original.parent / match[1]).resolve()
        target = 'scaffold-forms/' + path.name
        out = client / 'public' / target
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, out)
        assets[str(path.relative_to(source))] = target
        return "{uri: '/" + target + "'}"
    content = re.sub(r"require\('([^']+\.(?:png|jpg))'\)", asset, content)
    if name in ['screens/DayLabourVariationFormScreen.tsx', 'screens/HandoverCertificateFormScreen.tsx', 'screens/ScaffTagFormScreen.tsx']:
        content = content.replace("const usesIOSDocumentEditor = Platform.OS === 'ios';", 'const usesIOSDocumentEditor = true; // Same document editor on web.')
        # The web register supplies the site's company before mounting the editor.
        content = content.replace('if (route.params.formId) {\n      return;\n    }\n    let active = true;\n    getSafetyBuilders(true)',
            'if (route.params.formId || route.params.initialCompanyEntityId) {\n      return;\n    }\n    let active = true;\n    getSafetyBuilders(true)')
        content = content.replace('    route.params.builderName,\n    route.params.formId,',
            '    route.params.builderName,\n    route.params.initialCompanyEntityId,\n    route.params.formId,')
    if name == 'screens/DayLabourVariationFormScreen.tsx':
        # Reserve equal label widths so both signature boxes have equal space.
        content = content.replace('<Text style={styles.pdfSignatureLabel}>{label} SIGNATURE:</Text>', "<Text style={[styles.pdfSignatureLabel, {width: '50%', flexShrink: 0}]}>{label} SIGNATURE:</Text>")
        content = content.replace('          style={styles.pdfSignatureBox}', '          accessibilityRole="button"\n          accessibilityLabel={`${label} signature`}\n          style={styles.pdfSignatureBox}')
        content = content.replace('    labourTotalValue: {\n      flex: 1,', '    labourTotalValue: {\n      flex: 1,\n      width: 0,')
        content = content.replace("pdfInput: {color: '#222222'},", "pdfInput: {color: '#222222', minWidth: 0},")
        content = content.replace("pdfTitle: {width: '100%', fontSize: isWide ? 26 : 16", "pdfTitle: {width: '100%', fontSize: isWide ? 20 : 16")
        content = content.replace('        key={`pdf-photo-${slot}`}', '        key={`pdf-photo-${slot}`}\n        accessibilityRole="button"\n        accessibilityLabel={`${photo ? \'Replace\' : \'Add\'} photo ${slot + 1}`}')
        content = content.replace('companyEntityId: DEFAULT_COMPANY_ENTITY_ID,', 'companyEntityId: route.params.initialCompanyEntityId ?? DEFAULT_COMPANY_ENTITY_ID,')
        content = content.replace('[route.params.projectName, user?.fullName]', '[route.params.projectName, route.params.initialCompanyEntityId, user?.fullName]')
    if name == 'screens/HandoverCertificateFormScreen.tsx':
        # Section/location is entered by the inspector, not inferred from the project.
        content = content.replace("sectionLocation: route.params.initialLocation ?? '',", "sectionLocation: '',")
        content = content.replace('    route.params.initialLocation,\n', '')
        # Linking is handled by the web register, not a button over the form reference row.
        start = content.index('      {!isReadOnly && !isScaffTagLinked ? (')
        end = content.index('      {suggestedScaffTags.length > 0', start)
        content = content[:start] + content[end:]
        content = content.replace('  const isScaffTagLinked = Boolean(form.scaffTagFormId.trim());\n', '')
    if name == 'screens/ScaffTagFormScreen.tsx':
        content = content.replace('scrollEnabled={!usesIOSDocumentEditor}', 'scrollEnabled={true}')
        content = content.replace("import React from 'react';", "import React from 'react';\nimport {adaptScaffTagStyles} from '../browser/scaffTagStyles';")
        content = content.replace('return StyleSheet.create({', 'return StyleSheet.create(adaptScaffTagStyles({')
        content = '  }));'.join(content.rsplit('  });', 1))
    if name == 'components/DrawingRegisterPickerModal.tsx':
        # Use the registry already loaded by the web page instead of fetching it again.
        content = content.replace('  visible: boolean;', '  visible: boolean;\n  designFolderId?: string;')
        content = content.replace('  visible,\n  builderId,', '  visible,\n  designFolderId,\n  builderId,')
        content = content.replace('      const builders = await getSafetyBuilders(true);\n      const builder = builders.find(item => item.id === builderId)\n        ?? builders.find(item => item.name.trim().toLowerCase() === builderName.trim().toLowerCase());\n      const project = builder?.projects.find(item => item.id === projectId)\n        ?? builder?.projects.find(item => item.name.trim().toLowerCase() === projectName.trim().toLowerCase());\n      const folderId = project?.designFolderId?.trim();\n', '      let folderId = designFolderId?.trim();\n      if (designFolderId === undefined) {\n        const builders = await getSafetyBuilders(true);\n        const builder = builders.find(item => item.id === builderId)\n          ?? builders.find(item => item.name.trim().toLowerCase() === builderName.trim().toLowerCase());\n        const project = builder?.projects.find(item => item.id === projectId)\n          ?? builder?.projects.find(item => item.name.trim().toLowerCase() === projectName.trim().toLowerCase());\n        folderId = project?.designFolderId?.trim();\n      }\n')
        content = content.replace('[builderId, builderName, projectId, projectName]', '[builderId, builderName, projectId, projectName, designFolderId]')
    if name == 'components/PreStartDocumentEditor.tsx':
        content = content.replace("import Svg, { Polyline } from 'react-native-svg';", "import Svg, { Polyline } from '../browser/svg';")
    if name == 'screens/PreStartFormScreen.tsx':
        content = content.replace("import { usePreventRemove } from '@react-navigation/native';", '')
        content = content.replace("import Pdf from 'react-native-pdf';", "import Pdf from '../browser/Pdf';")
        start = content.index('  usePreventRemove(dirty || busy,')
        end = content.index('  const load =', start)
        content = content[:start] + '''  React.useEffect(() => {
    if (!dirty && !busy) return;
    const preventUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty, busy]);
  const requestClose = () => {
    if (busy) { Alert.alert('Please wait', 'The pre-start is being saved.'); return; }
    if (!dirty) { navigation.goBack(); return; }
    Alert.alert('Discard changes?', 'Your pre-start has unsaved changes.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: () => navigation.goBack()},
    ]);
  };
''' + content[end:]
        content = content.replace('onPressBack={() => navigation.goBack()}', 'onPressBack={requestClose}')
        content = content.replace('    createPreStartForm(', '    ({ ...createPreStartForm(')
        content = content.replace("      user?.fullName || '',\n    ),", "      user?.fullName || '',\n    ), companyEntityId: route.params.initialCompanyEntityId || 'ess' }),")
        content = content.replace('if (route.params.formId) {\n      return;\n    }\n    let active = true;\n    getSafetyBuilders(true)', 'if (route.params.formId || route.params.initialCompanyEntityId) {\n      return;\n    }\n    let active = true;\n    getSafetyBuilders(true)')
    if name == 'components/SignaturePadModal.tsx':
        content = content.replace('            {...panResponder.panHandlers}>',
            '            {...panResponder.panHandlers}\n            dataSet={{signatureCanvas: true}}>')
    if name == 'config/companyEntities.ts':
        content = content.replace("import ReactNativeBlobUtil from 'react-native-blob-util';", '')
        start = content.index('      const uri = Image.resolveAssetSource')
        end = content.index('\n    })().catch', start)
        content = content[:start] + '''      const response = await fetch((COMPANY_ENTITIES[entityId].logo as {uri: string}).uri);
      if (!response.ok) throw new Error('Unable to load the company logo.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));''' + content[end:]
    target = dest / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('// Derived from ESSApp/src/' + name + '; regenerate with scripts/sync-ios-scaffold-forms.py.\n' + content)
(dest / 'source-manifest.json').write_text(json.dumps({'files': files, 'sha256': source_hashes, 'assets': assets}, indent=2) + '\n')
