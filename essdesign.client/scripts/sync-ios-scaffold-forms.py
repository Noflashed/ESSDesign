"""Vendor iOS scaffold forms with browser-only import/asset adaptations.
Usage: python3 scripts/sync-ios-scaffold-forms.py /path/to/ESSApp
"""
from pathlib import Path
import sys, re, shutil, json, hashlib
source = Path(sys.argv[1]).resolve()
client = Path(__file__).resolve().parents[1]
dest = client / 'src/scaffoldForms'
files = '''screens/HandoverCertificateFormScreen.tsx screens/ScaffTagFormScreen.tsx
components/AppTopBar.tsx components/CompanyEntitySelector.tsx components/SignaturePadModal.tsx
components/ProjectDataFormDemoModal.tsx components/ProjectDataFormShareModal.tsx
components/ScaffoldRecordLinkControls.tsx components/DrawingRegisterPickerModal.tsx
services/supabaseHandoverCertificates.ts services/supabaseScaffTags.ts services/scaffTagPdfRenderer.ts
services/supabaseSafetyRecords.ts services/supabaseScaffTagQrLabels.ts services/supabaseScaffoldRegister.ts
services/supabaseDayLabourForms.ts utils/materialSelection.ts features/materialOrders/requestSchema.ts
theme/appTheme.ts config/companyEntities.ts utils/sydneyTime.ts utils/projectDataEmail.ts
utils/projectDataWorkflowDemoPreference.ts utils/scaffoldRecordMatching.ts utils/scaffTagQrLabelToken.ts
utils/scaffoldLifecycle.ts'''.split()
assets = {}
source_hashes = {}
for name in files:
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
    if name in ['screens/HandoverCertificateFormScreen.tsx', 'screens/ScaffTagFormScreen.tsx']:
        content = content.replace("const usesIOSDocumentEditor = Platform.OS === 'ios';", 'const usesIOSDocumentEditor = true; // Same document editor on web.')
    if name == 'screens/ScaffTagFormScreen.tsx':
        content = content.replace('scrollEnabled={!usesIOSDocumentEditor}', 'scrollEnabled={true}')
        content = content.replace("import React from 'react';", "import React from 'react';\nimport {adaptScaffTagStyles} from '../browser/scaffTagStyles';")
        content = content.replace('return StyleSheet.create({', 'return StyleSheet.create(adaptScaffTagStyles({')
        content = '  }));'.join(content.rsplit('  });', 1))
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
