// Derived from ESSApp/src/screens/HandoverCertificateFormScreen.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageStyle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from '../browser/runtime';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from '../browser/safeArea';
import {RootStackParamList} from '../navigation/AppNavigator';
import {usePreferences} from '../context/PreferencesContext';
import {useFolders} from '../context/FolderContext';
import {useAuth} from '../context/AuthContext';
import {BorderRadius, Colors, FontSize, Spacing, getTheme} from '../theme/appTheme';
import AppTopBar from '../components/AppTopBar';
import CompanyEntitySelector from '../components/CompanyEntitySelector';
import ProjectDataFormDemoModal from '../components/ProjectDataFormDemoModal';
import ProjectDataFormShareModal, {
  ProjectDataShareSelection,
} from '../components/ProjectDataFormShareModal';
import SignaturePadModal, {SignaturePadStroke} from '../components/SignaturePadModal';
import SideMenuDrawer from '../components/SideMenuDrawer';
import {
  ScaffoldLinkPickerItem,
  ScaffoldRecordLinkPickerModal,
} from '../components/ScaffoldRecordLinkControls';
import {pickProfileImage} from '../native/profileImagePicker';
import {composeEmailWithPdf} from '../native/iosEmailComposer';
import api from '../services/apiService';
import {BreadcrumbItem, DesignDocument, Folder} from '../models/folder';
import {getSafetyBuilders} from '../services/supabaseSafetyProjects';
import {
  CompanyEntityId,
  DEFAULT_COMPANY_ENTITY_ID,
  companyFormTitle,
  companyRepresentativeLabel,
  getCompanyEntity,
  normalizeCompanyEntityId,
} from '../config/companyEntities';
import {
  getHandoverCertificateForm,
  getHandoverCertificatePdfUrl,
  getHandoverCertificatePhotoUrl,
  HandoverAccessType,
  HandoverActionRow,
  HandoverChecklistStatus,
  HandoverScaffoldDuty,
  listHandoverCertificateForms,
  previewNextHandoverInspectionNumber,
  saveHandoverCertificateForm,
  SignatureStroke,
  uploadHandoverCertificatePhoto,
} from '../services/supabaseHandoverCertificates';
import {listScaffTagForms, ScaffTagListItem} from '../services/supabaseScaffTags';
import {findScaffoldMatches} from '../utils/scaffoldRecordMatching';
import {sydneyNowDisplayDateTime} from '../utils/sydneyTime';
import {
  collectProjectDataRecipientEmails,
  projectDataPdfFileName,
} from '../utils/projectDataEmail';
import {
  hideProjectDataWorkflowDemo,
  shouldShowProjectDataWorkflowDemo,
} from '../utils/projectDataWorkflowDemoPreference';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'HandoverCertificateForm'>;
  route: RouteProp<RootStackParamList, 'HandoverCertificateForm'>;
};

type ExistingPhoto = {slot: number; path: string; url: string};
type PendingPhoto = {slot: number; uri: string; fileName: string};
type SignatureTarget = 'ess' | 'client';
type DrawingBrowserItem = {type: 'folder'; data: Folder} | {type: 'document'; data: DesignDocument};

type FormState = {
  companyEntityId: CompanyEntityId;
  inspectionNumber: string;
  formReferenceName: string;
  inspectionDateTime: string;
  projectNumberClient: string;
  sectionLocation: string;
  intendedUse: string;
  drawingNumber: string;
  scaffTagId: string;
  scaffTagFormId: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty' | '';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
  scaffoldLength: string;
  scaffoldIdNo: string;
  baysLong: string;
  scaffoldHeight: string;
  workingDecks: string;
  accessType: HandoverAccessType;
  scaffoldDuty: HandoverScaffoldDuty;
  checklist: Record<string, HandoverChecklistStatus>;
  correctiveActions: HandoverActionRow[];
  comments: string;
  essRepresentativeName: string;
  essRepresentativeSignature: string;
  essRepresentativeSignatureStrokes: SignatureStroke[];
  clientName: string;
  clientSignature: string;
  clientSignatureStrokes: SignatureStroke[];
  hrwLicenceNumber: string;
};

type ChecklistItem = {id: string; label: string};
type ScreenStyles = ReturnType<typeof makeStyles>;

const PHOTO_SLOTS = [0, 1, 2, 3, 4, 5];
const PHONE_FORM_PAGE_SOURCE_WIDTH = 810;
const PHONE_FORM_PAGE_WIDTH = 704;
const PHONE_FORM_PAGE_LEFT_CROP = 53;
const PHONE_FORM_PAGE_ONE_HEIGHT = 1030;
const PHONE_FORM_PAGE_ONE_SOURCE_HEIGHT = 1247.211;
const PHONE_FORM_PAGE_ONE_TOP_CROP = 40;
const PHONE_FORM_PAGE_TWO_HEIGHT = 1000;
const PHONE_FORM_PAGE_TWO_SOURCE_HEIGHT = 1250.292;
const PHONE_FORM_PAGE_TWO_TOP_CROP = 40;

type PhoneFormBox = {left: number; top: number; width: number; height: number};
type PhoneChecklistPlacement = PhoneFormBox & {id: string};
type PhoneStringField =
  | 'inspectionNumber'
  | 'formReferenceName'
  | 'inspectionDateTime'
  | 'projectNumberClient'
  | 'sectionLocation'
  | 'intendedUse'
  | 'drawingNumber'
  | 'scaffTagId'
  | 'scaffoldLength'
  | 'scaffoldIdNo'
  | 'baysLong'
  | 'scaffoldHeight'
  | 'workingDecks';

function phoneFormBoxStyle(box: PhoneFormBox): ViewStyle {
  return {
    position: 'absolute',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  };
}

function projectDrawingBreadcrumbs(
  breadcrumbs: BreadcrumbItem[],
  projectFolderId: string | null | undefined,
): BreadcrumbItem[] {
  if (!projectFolderId) {
    return breadcrumbs;
  }
  const projectIndex = breadcrumbs.findIndex(crumb => crumb.id === projectFolderId);
  return projectIndex >= 0 ? breadcrumbs.slice(projectIndex + 1) : [];
}

function phonePageFittedCanvasStyle(pageHeight: number, scale: number): ViewStyle {
  return {width: PHONE_FORM_PAGE_WIDTH * scale, height: pageHeight * scale};
}

function phonePageImageStyle(pageHeight: number): ImageStyle {
  return {width: PHONE_FORM_PAGE_SOURCE_WIDTH, height: pageHeight};
}

function phonePageScaledCanvasStyle(pageHeight: number, scale: number): ViewStyle {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PHONE_FORM_PAGE_WIDTH,
    height: pageHeight,
    transformOrigin: 'top left',
    transform: [{scale}],
  };
}

function checklistPlacements(
  items: ChecklistItem[],
  boundaries: number[],
  left: number,
): PhoneChecklistPlacement[] {
  return items.map((item, index) => ({
    id: item.id,
    left,
    top: boundaries[index],
    width: 80,
    height: boundaries[index + 1] - boundaries[index],
  }));
}

const DETAILS_FIELDS: Array<{key: keyof Pick<FormState,
  'formReferenceName' | 'inspectionDateTime' | 'projectNumberClient' | 'sectionLocation'
>; label: string; multiline?: boolean}> = [
  {key: 'formReferenceName', label: 'Form Reference Name'},
  {key: 'inspectionDateTime', label: 'Date/Time of inspection'},
  {key: 'projectNumberClient', label: 'Project Number / Client'},
  {key: 'sectionLocation', label: 'Section/location of scaffold', multiline: true},
];

const SCAFFOLD_VICINITY: ChecklistItem[] = [
  {id: 'publicProtection', label: 'Has public protection been provided?'},
  {id: 'powerlinesDistance', label: 'Does distance from powerlines meet requirements?'},
  {id: 'vehiclePlantControl', label: 'Is there sufficient control over vehicle/plant movements?'},
  {id: 'craneOperationControl', label: 'Is there sufficient control over crane operation?'},
  {id: 'excavationDistance', label: 'Are scaffolds erected a safe distance from excavations/trenches?'},
  {id: 'safeAccessPlatforms', label: 'Is safe access provided to all working platforms?'},
  {id: 'decksInternalHandrailMidrail', label: 'Are decks complete with internal handrail and midrail?'},
  {id: 'hopUpsComplete', label: 'Are hop-ups complete with planks and tie bars?'},
  {id: 'decksFreeLooseItems', label: 'Are scaffold decks free from loose items and debris?'},
  {id: 'penetrationsSecure', label: 'Are all penetrations hand railed and/or covered and secure?'},
];

const SUPPORTING_STRUCTURES: ChecklistItem[] = [
  {id: 'supportingStructureCondition', label: 'Is the supporting structure in good condition?'},
  {id: 'supportingStructureAdequate', label: 'Is the supporting structure adequate to support the scaffold loads?'},
  {id: 'foundationAdequate', label: 'Is the foundation adequate to support the scaffolding (e.g. ground)?'},
  {id: 'soleboardsCondition', label: 'Are the soleboards in good condition and fully bearing the ground?'},
  {id: 'jacksBaseplatesBearing', label: 'Are all jacks/baseplates fully bearing on the soleboards/foundations?'},
  {id: 'needlesInstalledAccordingToDesign', label: 'Are needles/UB\'s installed according to design?'},
];

const SCAFFOLD_STRUCTURES: ChecklistItem[] = [
  {id: 'decksInstalledEvery2m', label: 'Are decks installed every 2m?'},
  {id: 'lapPlanksSecured', label: 'Are lap planks secured to prevent movement during use?'},
  {id: 'incompleteAreasBlocked', label: 'Are incomplete areas fitted with signage and blocked off to access?'},
  {id: 'lapPlanksBearing', label: 'Are lap planks adequately bearing on the supporting decks (min. 150mm)?'},
  {id: 'bracingAdequate', label: 'Is the bracing fitted adequate and as per design?'},
  {id: 'containmentSheetingFixed', label: 'Is containment sheeting fixed and secured at 1m centres?'},
  {id: 'shadeClothFireRetardant', label: 'Is the shade cloth fire retardant?'},
  {id: 'tiesInstalledToSpecifications', label: 'Are ties installed to specifications?'},
  {id: 'scaffoldTagInstalled', label: 'Has a scafftag been installed on scaffold?'},
  {id: 'scaffoldErectedToDesign', label: 'Is the scaffold erected as per design drawing?'},
  {id: 'ladderBeamsTied', label: 'Are ladder beams tied at each 1.2m? With cross bracing as per drawing?'},
  {id: 'scaffoldSquarePlumb', label: 'Is scaffold square and plumb?'},
  {id: 'gapBetweenPlatformsLess225', label: 'Is the gap between scaffold platforms (inc. Hop ups) and the workforce less than 225mm?'},
  {id: 'decksCompleteExternalHandrail', label: 'Are decks complete with external handrail, midrail and kickboards and/or mesh and chain & shade?'},
];

const PHONE_CHECKLIST_LABELS = [
  ...SCAFFOLD_VICINITY,
  ...SUPPORTING_STRUCTURES,
  ...SCAFFOLD_STRUCTURES,
].reduce<Record<string, string>>((labels, item) => {
  labels[item.id] = item.label;
  return labels;
}, {});

const PHONE_LEFT_VICINITY_ROWS = [465.1, 486.2, 506.9, 533.8, 554.4, 581.3];
const PHONE_LEFT_SUPPORT_ROWS = [602.4, 629.3, 655.7, 682.6, 709.4, 736.0, 757.0];
const PHONE_LEFT_STRUCTURE_ROWS = [778.1, 798.7, 826.1, 852.0];
const PHONE_RIGHT_STRUCTURE_ROWS = [581.3, 602.4, 629.3, 655.7, 682.6, 709.4, 736.0, 757.0, 778.1, 798.7, 826.1, 852.0];
const PHONE_CHECKLIST_PLACEMENTS: PhoneChecklistPlacement[] = [
  ...checklistPlacements(SCAFFOLD_VICINITY.slice(0, 5), PHONE_LEFT_VICINITY_ROWS, 322),
  ...checklistPlacements(SCAFFOLD_VICINITY.slice(5), PHONE_LEFT_VICINITY_ROWS, 666),
  ...checklistPlacements(SUPPORTING_STRUCTURES, PHONE_LEFT_SUPPORT_ROWS, 322),
  ...checklistPlacements(SCAFFOLD_STRUCTURES.slice(-3), PHONE_LEFT_STRUCTURE_ROWS, 322),
  ...checklistPlacements(SCAFFOLD_STRUCTURES.slice(0, 11), PHONE_RIGHT_STRUCTURE_ROWS, 666),
];

const PHONE_DETAIL_FIELDS: Array<{
  key: PhoneStringField;
  label: string;
  box: PhoneFormBox;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}> = [
  {key: 'inspectionNumber', label: 'Inspection number', box: {left: 684.5, top: 102.5, width: 51.5, height: 19}},
  {key: 'formReferenceName', label: 'Form Reference Name', box: {left: 201, top: 184, width: 462, height: 20.7}},
  {key: 'inspectionDateTime', label: 'Date/Time of inspection', box: {left: 201, top: 205.2, width: 542.5, height: 21.1}},
  {key: 'projectNumberClient', label: 'Project Number / Client', box: {left: 201, top: 227, width: 542.5, height: 21.5}},
  {key: 'sectionLocation', label: 'Section/location of scaffold', box: {left: 201, top: 249, width: 542.5, height: 21.4}},
  {key: 'intendedUse', label: 'Intended use', box: {left: 201, top: 271, width: 193, height: 21.4}},
  {key: 'workingDecks', label: 'No. of working decks', box: {left: 554, top: 271, width: 189.5, height: 21.4}, keyboardType: 'number-pad'},
  {key: 'scaffoldLength', label: 'Scaffold Length', box: {left: 201, top: 293.2, width: 193, height: 18.2}, keyboardType: 'decimal-pad'},
  {key: 'scaffoldIdNo', label: 'Scaffold ID No', box: {left: 554, top: 293.2, width: 189.5, height: 18.2}, keyboardType: 'number-pad'},
  {key: 'baysLong', label: 'No. of bays long', box: {left: 201, top: 312.2, width: 193, height: 18.2}, keyboardType: 'number-pad'},
  {key: 'scaffoldHeight', label: 'Scaffold Height', box: {left: 554, top: 312.2, width: 189.5, height: 18.2}, keyboardType: 'decimal-pad'},
  {key: 'drawingNumber', label: 'Drawing Number', box: {left: 201, top: 331.2, width: 193, height: 18.2}},
  {key: 'scaffTagId', label: 'Scaff-Tag ID', box: {left: 554, top: 331.2, width: 189.5, height: 18.2}},
];

const EMPTY_SCAFF_TAG_ID_PLACEHOLDER = 'Create Scaff-Tag to generate';

const PHONE_ACCESS_CHOICES: Array<{value: HandoverAccessType; box: PhoneFormBox}> = [
  {value: 'stretcher-stair', box: {left: 275, top: 378.7, width: 26, height: 23.5}},
  {value: 'aluminium-access-stair', box: {left: 474, top: 378.7, width: 26, height: 23.5}},
  {value: 'ladder-access', box: {left: 648, top: 381, width: 26, height: 23.5}},
];

const PHONE_DUTY_CHOICES: Array<{value: HandoverScaffoldDuty; box: PhoneFormBox}> = [
  {value: 'LIGHT', box: {left: 275, top: 412.2, width: 26, height: 23.5}},
  {value: 'MEDIUM', box: {left: 474, top: 412.2, width: 26, height: 23.5}},
  {value: 'HEAVY', box: {left: 648, top: 412.2, width: 26, height: 23.5}},
];

const PHONE_DUTY_LABELS: Array<{label: string; box: PhoneFormBox}> = [
  {label: 'Light 225kg', box: {left: 190, top: 412.2, width: 82, height: 23.5}},
  {label: 'Medium 450kg', box: {left: 365, top: 412.2, width: 105, height: 23.5}},
  {label: 'Heavy 675kg', box: {left: 550, top: 412.2, width: 94, height: 23.5}},
];

const PHONE_ACTION_ROWS = [893.8, 915.4, 937.4, 959.5, 981.1];
const PHONE_PHOTO_BOXES: PhoneFormBox[] = [
  {left: 65.5, top: 184.3, width: 225.8, height: 223.5},
  {left: 291.8, top: 184.3, width: 225.7, height: 223.5},
  {left: 518, top: 184.3, width: 225.8, height: 223.5},
  {left: 65.5, top: 408.3, width: 225.8, height: 223.5},
  {left: 291.8, top: 408.3, width: 225.7, height: 223.5},
  {left: 518, top: 408.3, width: 225.8, height: 223.5},
];

function nowStamp(): string {
  return sydneyNowDisplayDateTime();
}

function defaultChecklist(): Record<string, HandoverChecklistStatus> {
  return [...SCAFFOLD_VICINITY, ...SUPPORTING_STRUCTURES, ...SCAFFOLD_STRUCTURES].reduce<Record<string, HandoverChecklistStatus>>(
    (acc, item) => {
      acc[item.id] = '';
      return acc;
    },
    {},
  );
}

function emptyActions(): HandoverActionRow[] {
  return Array.from({length: 4}, () => ({actionRequired: '', completedBy: '', date: ''}));
}

function sanitizeDigitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function sanitizeDecimalNumber(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) {
    return cleaned;
  }
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
}

function readLayoutSize(
  event: {nativeEvent?: {layout?: {width?: number; height?: number}}} | undefined,
): {width: number; height: number} {
  const layout = event?.nativeEvent?.layout;
  return {
    width: typeof layout?.width === 'number' ? layout.width : 0,
    height: typeof layout?.height === 'number' ? layout.height : 0,
  };
}

function extractDrawingNumberFromDocumentName(value: string): string {
  const match = value.match(/\bESD\s*[-_]*\s*(\d{3,6})\b/i);
  if (match) {
    return `ESD${match[1]}`;
  }
  return value.replace(/\.pdf$/i, '').trim();
}

function isScaffoldRevisionsFolder(name: string): boolean {
  return /\brevisions?\b/i.test(name);
}

function getDocumentDisplayName(item: DesignDocument): string {
  return item.essDesignIssueName || item.thirdPartyDesignName || item.description || `Revision ${item.revisionNumber}`;
}

function getRevisionSortValue(item: DesignDocument): number {
  const revisionMatch = item.revisionNumber.match(/\d+/);
  if (revisionMatch) {
    return Number.parseInt(revisionMatch[0], 10);
  }

  const nameMatch = getDocumentDisplayName(item).match(/\bREV(?:ISION)?\s*[-_]*\s*(\d+)\b/i);
  if (nameMatch) {
    return Number.parseInt(nameMatch[1], 10);
  }

  return -1;
}

function getLatestRevisionDocument(documents: DesignDocument[]): DesignDocument | null {
  const selectableDocuments = documents.filter(document => document.essDesignIssuePath || document.thirdPartyDesignPath);
  if (selectableDocuments.length === 0) {
    return null;
  }

  return [...selectableDocuments].sort((first, second) => {
    const revisionDifference = getRevisionSortValue(second) - getRevisionSortValue(first);
    if (revisionDifference !== 0) {
      return revisionDifference;
    }

    const firstDate = first.updatedAt || first.createdAt || '';
    const secondDate = second.updatedAt || second.createdAt || '';
    return secondDate.localeCompare(firstDate);
  })[0] ?? null;
}

function serializeFormState(form: FormState): string {
  return JSON.stringify({
    ...form,
    checklist: Object.keys(form.checklist)
      .sort()
      .reduce<Record<string, HandoverChecklistStatus>>((acc, key) => {
        acc[key] = form.checklist[key];
        return acc;
      }, {}),
    correctiveActions: form.correctiveActions.map(row => ({
      actionRequired: row.actionRequired,
      completedBy: row.completedBy,
      date: row.date,
    })),
  });
}

export default function HandoverCertificateFormScreen({navigation, route}: Props) {
  const prefs = usePreferences();
  const folders = useFolders();
  const {loadNotificationRecipients, notificationRecipients} = folders;
  const {user} = useAuth();
  const theme = getTheme(prefs.themeMode);
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const isWide = Platform.isPad || width >= 1024;
  const isIOSDevice = Platform.OS === 'ios';
  const usesIOSDocumentEditor = true; // Same document editor on web.
  const [documentPagerHeight, setDocumentPagerHeight] = React.useState(0);
  const [documentPagerWidth, setDocumentPagerWidth] = React.useState(0);
  const phonePageViewportWidth = Math.max(1, documentPagerWidth || width);
  const phonePageAvailableHeight = Math.max(
    180,
    documentPagerHeight || height - insets.top - insets.bottom - 112,
  );
  const phonePageVisibleHeight = Math.max(
    180,
    phonePageAvailableHeight - 64 - insets.bottom,
  );
  const styles = React.useMemo(() => makeStyles(theme, isWide), [theme, isWide]);
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [loading, setLoading] = React.useState(!!route.params.formId);
  const [saving, setSaving] = React.useState(false);
  const [openingShare, setOpeningShare] = React.useState(false);
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [shareRecipientsLoading, setShareRecipientsLoading] = React.useState(false);
  const [shareSending, setShareSending] = React.useState(false);
  const [shareEmailingAttachment, setShareEmailingAttachment] = React.useState(false);
  const [sharePdfUrl, setSharePdfUrl] = React.useState('');
  const [showWorkflowDemo, setShowWorkflowDemo] = React.useState(false);
  const [showSignatureModal, setShowSignatureModal] = React.useState(false);
  const [signatureTarget, setSignatureTarget] = React.useState<SignatureTarget>('ess');
  const [signaturePreviewSize, setSignaturePreviewSize] = React.useState<Record<SignatureTarget, {width: number; height: number}>>({
    ess: {width: 0, height: 0},
    client: {width: 0, height: 0},
  });
  const [formId, setFormId] = React.useState(route.params.formId ?? '');
  const [scaffoldRegisterId, setScaffoldRegisterId] = React.useState(
    route.params.initialScaffoldRegisterId ?? '',
  );
  const [createdAt, setCreatedAt] = React.useState<string | undefined>(undefined);
  const [existingPhotos, setExistingPhotos] = React.useState<ExistingPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = React.useState<PendingPhoto[]>([]);
  const [isEditingScaffoldLength, setIsEditingScaffoldLength] = React.useState(false);
  const [isEditingScaffoldHeight, setIsEditingScaffoldHeight] = React.useState(false);
  const [isDrawingNumberFocused, setIsDrawingNumberFocused] = React.useState(false);
  const [showDrawingRegister, setShowDrawingRegister] = React.useState(false);
  const [availableScaffTags, setAvailableScaffTags] = React.useState<ScaffTagListItem[]>([]);
  const [scaffTagLinkOwners, setScaffTagLinkOwners] = React.useState<Record<string, string>>({});
  const [showScaffTagPicker, setShowScaffTagPicker] = React.useState(false);
  const [drawingRootFolders, setDrawingRootFolders] = React.useState<Folder[]>([]);
  const [drawingCurrentFolder, setDrawingCurrentFolder] = React.useState<Folder | null>(null);
  const [drawingBreadcrumbs, setDrawingBreadcrumbs] = React.useState<BreadcrumbItem[]>([]);
  const [drawingRegisterLoading, setDrawingRegisterLoading] = React.useState(false);
  const [drawingRegisterError, setDrawingRegisterError] = React.useState('');
  const [drawingRegisterProjectScoped, setDrawingRegisterProjectScoped] = React.useState(false);
  const drawingNumberInputRef = React.useRef<TextInput | null>(null);
  const drawingRootCacheRef = React.useRef<Folder[] | null>(null);
  const drawingFolderCacheRef = React.useRef<Map<string, {folder: Folder; breadcrumbs: BreadcrumbItem[]}>>(new Map());
  const drawingProjectFolderIdRef = React.useRef<string | null | undefined>(undefined);
  const drawingProjectFolderLoadRef = React.useRef<Promise<{
    folder: Folder;
    breadcrumbs: BreadcrumbItem[];
  }> | null>(null);
  const baselineSnapshotRef = React.useRef<string | null>(null);
  const companySelectionTouchedRef = React.useRef(false);
  const initialFormState = React.useMemo<FormState>(() => ({
    companyEntityId: route.params.initialCompanyEntityId ?? DEFAULT_COMPANY_ENTITY_ID,
    inspectionNumber: '',
    formReferenceName: route.params.initialScaffoldName ?? '',
    inspectionDateTime: nowStamp(),
    projectNumberClient: route.params.projectName,
    sectionLocation: route.params.initialLocation ?? '',
    intendedUse: '',
    drawingNumber: route.params.initialDrawingNumber ?? '',
    scaffTagId: route.params.initialScaffTagId ?? '',
    scaffTagFormId: route.params.initialScaffTagFormId ?? '',
    drawingDocumentId: route.params.initialDrawingDocumentId ?? '',
    drawingDocumentType: route.params.initialDrawingDocumentType ?? '',
    drawingDocumentName: route.params.initialDrawingDocumentName ?? '',
    drawingRevisionNumber: route.params.initialDrawingRevisionNumber ?? '',
    drawingFolderId: route.params.initialDrawingFolderId ?? '',
    scaffoldLength: '',
    scaffoldIdNo: '',
    baysLong: '',
    scaffoldHeight: '',
    workingDecks: '',
    accessType: '',
    scaffoldDuty: '',
    checklist: defaultChecklist(),
    correctiveActions: emptyActions(),
    comments: '',
    essRepresentativeName: user?.fullName ?? '',
    essRepresentativeSignature: '',
    essRepresentativeSignatureStrokes: [],
    clientName: '',
    clientSignature: '',
    clientSignatureStrokes: [],
    hrwLicenceNumber: '',
  }), [
    route.params.initialCompanyEntityId,
    route.params.initialDrawingDocumentId,
    route.params.initialDrawingFolderId,
    route.params.initialDrawingDocumentName,
    route.params.initialDrawingRevisionNumber,
    route.params.initialDrawingDocumentType,
    route.params.initialDrawingNumber,
    route.params.initialLocation,
    route.params.initialScaffTagFormId,
    route.params.initialScaffTagId,
    route.params.initialScaffoldName,
    route.params.projectName,
    user?.fullName,
  ]);
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const company = getCompanyEntity(form.companyEntityId);
  const representativeLabel = companyRepresentativeLabel(company.id);
  const [inspectionNumberPreview, setInspectionNumberPreview] = React.useState('');
  const isReadOnly = route.params.readOnly === true;
  const isScaffoldRegisterLinked = Boolean(scaffoldRegisterId.trim());
  const isDrawingLinked = Boolean(form.drawingDocumentId.trim());
  const currentSnapshot = React.useMemo(() => serializeFormState(form), [form]);
  const hasUnsavedChanges = !isReadOnly && baselineSnapshotRef.current !== null && (
    currentSnapshot !== baselineSnapshotRef.current || pendingPhotos.length > 0
  );
  const linkableScaffTags = React.useMemo(() => availableScaffTags.filter(item => {
    const linkedHandoverId = scaffTagLinkOwners[item.id] || item.handoverFormId;
    return !linkedHandoverId || linkedHandoverId === formId;
  }), [availableScaffTags, formId, scaffTagLinkOwners]);
  const scaffTagPickerItems = React.useMemo<ScaffoldLinkPickerItem[]>(() =>
    linkableScaffTags.map(item => ({
      id: item.id,
      title: item.scaffoldNo || 'Untitled Scaff-Tag',
      subtitle: item.jobLocation || 'No location recorded',
      reference: item.tagNumber ? `ST-${item.tagNumber}` : 'Scaff-Tag',
      searchText: [item.scaffoldNo, item.tagNumber, item.jobLocation].filter(Boolean).join(' '),
    })), [linkableScaffTags]);
  const suggestedScaffTags = React.useMemo(() => {
    if (form.scaffTagFormId || !form.formReferenceName.trim()) {
      return [];
    }
    return findScaffoldMatches(
      form.formReferenceName,
      linkableScaffTags.map(item => ({item, values: [item.scaffoldNo]})),
    ).map(match => match.item);
  }, [form.formReferenceName, form.scaffTagFormId, linkableScaffTags]);

  const selectScaffTag = React.useCallback((scaffTag: ScaffTagListItem) => {
    setForm(previous => ({
      ...previous,
      formReferenceName: isScaffoldRegisterLinked
        ? previous.formReferenceName
        : scaffTag.scaffoldNo || previous.formReferenceName,
      scaffTagFormId: scaffTag.id,
      scaffTagId: scaffTag.tagNumber,
    }));
    setShowScaffTagPicker(false);
  }, [isScaffoldRegisterLinked]);

  React.useEffect(() => {
    let isMounted = true;
    if (!isIOSDevice || route.params.formId || !user?.id) {
      return () => {
        isMounted = false;
      };
    }

    shouldShowProjectDataWorkflowDemo(user.id)
      .then(shouldShow => {
        if (isMounted && shouldShow) {
          setShowWorkflowDemo(true);
        }
      })
      .catch(() => {
        // A local preference failure should not interrupt form creation.
      });

    return () => {
      isMounted = false;
    };
  }, [isIOSDevice, route.params.formId, user?.id]);

  const dismissWorkflowDemoPermanently = React.useCallback(() => {
    setShowWorkflowDemo(false);
    if (user?.id) {
      hideProjectDataWorkflowDemo(user.id).catch(() => {
        // Keep dismissal non-blocking if local storage is unavailable.
      });
    }
  }, [user?.id]);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      listScaffTagForms(route.params.builderId, route.params.projectId),
      listHandoverCertificateForms(route.params.builderId, route.params.projectId),
    ])
      .then(([items, handovers]) => {
        if (active) {
          setAvailableScaffTags(items);
          setScaffTagLinkOwners(handovers.reduce<Record<string, string>>((owners, handover) => {
            if (handover.scaffTagFormId) {
              owners[handover.scaffTagFormId] = handover.id;
            }
            return owners;
          }, {}));
        }
      })
      .catch(() => {
        if (active) {
          setAvailableScaffTags([]);
          setScaffTagLinkOwners({});
        }
      });
    return () => {
      active = false;
    };
  }, [route.params.builderId, route.params.projectId]);

  React.useEffect(() => {
    if (!route.params.formId) {
      baselineSnapshotRef.current = serializeFormState(initialFormState);
      let isMounted = true;
      previewNextHandoverInspectionNumber(route.params.builderId, route.params.projectId)
        .then(nextNumber => {
          if (isMounted) {
            setInspectionNumberPreview(nextNumber);
          }
        })
        .catch(() => {
          // Saving remains authoritative if the preview cannot be loaded.
        });
      return () => {
        isMounted = false;
      };
    }
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const existing = await getHandoverCertificateForm(
          route.params.builderId,
          route.params.projectId,
          route.params.formId as string,
        );
        if (!existing || !isMounted) {
          return;
        }

        setFormId(existing.id);
        setScaffoldRegisterId(existing.scaffoldRegisterId);
        setCreatedAt(existing.createdAt);
        setForm({
          companyEntityId: existing.companyEntityId,
          inspectionNumber: existing.inspectionNumber,
          formReferenceName: existing.formReferenceName,
          inspectionDateTime: existing.inspectionDateTime,
          projectNumberClient: existing.projectNumberClient,
          sectionLocation: existing.sectionLocation,
          intendedUse: existing.intendedUse,
          drawingNumber: existing.drawingNumber,
          scaffTagId: existing.scaffTagId,
          scaffTagFormId: existing.scaffTagFormId,
          drawingDocumentId: existing.drawingDocumentId,
          drawingDocumentType: existing.drawingDocumentType,
          drawingDocumentName: existing.drawingDocumentName,
          drawingRevisionNumber: existing.drawingRevisionNumber,
          drawingFolderId: existing.drawingFolderId,
          scaffoldLength: existing.scaffoldLength,
          scaffoldIdNo: existing.scaffoldIdNo,
          baysLong: existing.baysLong,
          scaffoldHeight: existing.scaffoldHeight,
          workingDecks: existing.workingDecks,
          accessType: existing.accessType,
          scaffoldDuty: existing.scaffoldDuty,
          checklist: {...defaultChecklist(), ...existing.checklist},
          correctiveActions: existing.correctiveActions.length > 0 ? existing.correctiveActions : emptyActions(),
          comments: existing.comments,
          essRepresentativeName: existing.essRepresentativeName,
          essRepresentativeSignature: existing.essRepresentativeSignature,
          essRepresentativeSignatureStrokes: existing.essRepresentativeSignatureStrokes ?? [],
          clientName: existing.clientName,
          clientSignature: existing.clientSignature,
          clientSignatureStrokes: existing.clientSignatureStrokes ?? [],
          hrwLicenceNumber: existing.hrwLicenceNumber,
        });
        baselineSnapshotRef.current = serializeFormState({
          companyEntityId: existing.companyEntityId,
          inspectionNumber: existing.inspectionNumber,
          formReferenceName: existing.formReferenceName,
          inspectionDateTime: existing.inspectionDateTime,
          projectNumberClient: existing.projectNumberClient,
          sectionLocation: existing.sectionLocation,
          intendedUse: existing.intendedUse,
          drawingNumber: existing.drawingNumber,
          scaffTagId: existing.scaffTagId,
          scaffTagFormId: existing.scaffTagFormId,
          drawingDocumentId: existing.drawingDocumentId,
          drawingDocumentType: existing.drawingDocumentType,
          drawingDocumentName: existing.drawingDocumentName,
          drawingRevisionNumber: existing.drawingRevisionNumber,
          drawingFolderId: existing.drawingFolderId,
          scaffoldLength: existing.scaffoldLength,
          scaffoldIdNo: existing.scaffoldIdNo,
          baysLong: existing.baysLong,
          scaffoldHeight: existing.scaffoldHeight,
          workingDecks: existing.workingDecks,
          accessType: existing.accessType,
          scaffoldDuty: existing.scaffoldDuty,
          checklist: {...defaultChecklist(), ...existing.checklist},
          correctiveActions: existing.correctiveActions.length > 0 ? existing.correctiveActions : emptyActions(),
          comments: existing.comments,
          essRepresentativeName: existing.essRepresentativeName,
          essRepresentativeSignature: existing.essRepresentativeSignature,
          essRepresentativeSignatureStrokes: existing.essRepresentativeSignatureStrokes ?? [],
          clientName: existing.clientName,
          clientSignature: existing.clientSignature,
          clientSignatureStrokes: existing.clientSignatureStrokes ?? [],
          hrwLicenceNumber: existing.hrwLicenceNumber,
        });

        const photoUrls = await Promise.all(
          existing.photoSlots.map(async item => ({
            slot: item.slot,
            path: item.path,
            url: await getHandoverCertificatePhotoUrl(item.path),
          })),
        );

        if (isMounted) {
          setPendingPhotos([]);
          setExistingPhotos(photoUrls);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })().catch(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [initialFormState, route.params.builderId, route.params.projectId, route.params.formId]);

  React.useEffect(() => {
    if (route.params.formId) {
      return;
    }
    let active = true;
    getSafetyBuilders(true)
      .then(builders => {
        if (!active || companySelectionTouchedRef.current) {
          return;
        }
        const builder = builders.find(item => item.id === route.params.builderId)
          ?? builders.find(item => item.name.trim().toLowerCase() === route.params.builderName.trim().toLowerCase());
        const project = builder?.projects.find(item => item.id === route.params.projectId)
          ?? builder?.projects.find(item => item.name.trim().toLowerCase() === route.params.projectName.trim().toLowerCase());
        const entityId = normalizeCompanyEntityId(project?.scaffoldEntity);
        setForm(previous => {
          const next = {...previous, companyEntityId: entityId};
          baselineSnapshotRef.current = serializeFormState(next);
          return next;
        });
      })
      .catch(() => {
        // Erect Safe remains the safe default when project metadata is unavailable.
      });
    return () => {
      active = false;
    };
  }, [
    route.params.builderId,
    route.params.builderName,
    route.params.formId,
    route.params.projectId,
    route.params.projectName,
  ]);

  const goDesignRoot = () => {
    folders.goToRoot();
    folders.clearSearch();
    navigation.reset({
      index: 0,
      routes: [{name: 'Home'}],
    });
    folders.loadRootFolders().catch(() => {
      // Home handles load state.
    });
  };

  const renderSignatureStrokes = React.useCallback((strokes: SignatureStroke[], boxWidth: number, boxHeight: number) => {
    if (boxWidth <= 0 || boxHeight <= 0) {
      return null;
    }

    const strokeWidth = 2.6;
    const capSize = 3.2;
    const nodes: React.ReactNode[] = [];

    strokes.forEach((stroke, strokeIndex) => {
      if (!Array.isArray(stroke) || stroke.length === 0) {
        return;
      }

      for (let i = 1; i < stroke.length; i += 1) {
        const prev = stroke[i - 1];
        const curr = stroke[i];
        const x1 = prev.x * boxWidth;
        const y1 = prev.y * boxHeight;
        const x2 = curr.x * boxWidth;
        const y2 = curr.y * boxHeight;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(length) || length < 0.5) {
          continue;
        }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const solidLength = length + (strokeWidth * 1.5);
        nodes.push(
          <View
            key={`sig-seg-${strokeIndex}-${i}`}
            // eslint-disable-next-line react-native/no-inline-styles
            style={{
              position: 'absolute',
              left: centerX - solidLength / 2,
              top: centerY - strokeWidth / 2,
              width: solidLength,
              height: strokeWidth,
              borderRadius: strokeWidth / 2,
              backgroundColor: '#111111',
              transform: [{rotateZ: `${angle}deg`}],
            }}
          />,
        );
      }

      const last = stroke[stroke.length - 1];
      nodes.push(
        <View
          key={`sig-cap-${strokeIndex}`}
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(boxWidth - capSize, last.x * boxWidth - capSize / 2)),
            top: Math.max(0, Math.min(boxHeight - capSize, last.y * boxHeight - capSize / 2)),
            width: capSize,
            height: capSize,
            borderRadius: capSize / 2,
            backgroundColor: '#111111',
          }}
        />,
      );
    });

    return nodes;
  }, []);

  const getPhotoForSlot = (slot: number) => {
    const pending = pendingPhotos.find(item => item.slot === slot);
    if (pending) {
      return {uri: pending.uri};
    }
    const existing = existingPhotos.find(item => item.slot === slot);
    if (existing) {
      return {uri: existing.url};
    }
    return null;
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
      ...(key === 'scaffTagId' ? {scaffTagFormId: ''} : {}),
      ...(key === 'formReferenceName' ? {scaffTagFormId: '', scaffTagId: ''} : {}),
    }));
  };

  const updateNumericField = React.useCallback(
    (
      key: 'scaffoldLength' | 'scaffoldIdNo' | 'baysLong' | 'scaffoldHeight' | 'workingDecks',
      value: string,
    ) => {
      const nextValue =
        key === 'scaffoldLength' || key === 'scaffoldHeight'
          ? sanitizeDecimalNumber(value)
          : sanitizeDigitsOnly(value);
      setForm(prev => ({...prev, [key]: nextValue}));
    },
    [],
  );

  const updateActionRow = (index: number, key: keyof HandoverActionRow, value: string) => {
    setForm(prev => {
      const next = [...prev.correctiveActions];
      next[index] = {...next[index], [key]: value};
      return {...prev, correctiveActions: next};
    });
  };

  const updateChecklist = (id: string, value: HandoverChecklistStatus) => {
    if (isReadOnly) {
      return;
    }
    setForm(prev => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [id]: prev.checklist[id] === value ? '' : value,
      },
    }));
  };

  const markAllChecklistYes = () => {
    if (isReadOnly) {
      return;
    }
    setForm(prev => ({
      ...prev,
      checklist: Object.keys(defaultChecklist()).reduce<Record<string, HandoverChecklistStatus>>(
        (nextChecklist, itemId) => {
          nextChecklist[itemId] = 'YES';
          return nextChecklist;
        },
        {...prev.checklist},
      ),
    }));
  };

  const resolveDrawingProjectFolderId = React.useCallback(async (): Promise<string | null> => {
    if (drawingProjectFolderIdRef.current !== undefined) {
      return drawingProjectFolderIdRef.current;
    }

    const builders = await getSafetyBuilders(true);
    const builder = builders.find(item => item.id === route.params.builderId)
      ?? builders.find(item => item.name.trim().toLowerCase() === route.params.builderName.trim().toLowerCase());
    const project = builder?.projects.find(item => item.id === route.params.projectId)
      ?? builder?.projects.find(item => item.name.trim().toLowerCase() === route.params.projectName.trim().toLowerCase());
    const projectFolderId = project?.designFolderId?.trim() || null;
    drawingProjectFolderIdRef.current = projectFolderId;
    return projectFolderId;
  }, [route.params.builderId, route.params.builderName, route.params.projectId, route.params.projectName]);

  const loadDrawingProjectFolder = React.useCallback(async (projectFolderId: string): Promise<{
    folder: Folder;
    breadcrumbs: BreadcrumbItem[];
  }> => {
    const cached = drawingFolderCacheRef.current.get(projectFolderId);
    if (cached) {
      return cached;
    }
    if (drawingProjectFolderLoadRef.current) {
      return drawingProjectFolderLoadRef.current;
    }

    const request = api.getFolder(projectFolderId).then(folder => {
      const result = {folder, breadcrumbs: [] as BreadcrumbItem[]};
      drawingFolderCacheRef.current.set(projectFolderId, result);
      return result;
    });
    drawingProjectFolderLoadRef.current = request;
    try {
      return await request;
    } finally {
      if (drawingProjectFolderLoadRef.current === request) {
        drawingProjectFolderLoadRef.current = null;
      }
    }
  }, []);

  React.useEffect(() => {
    resolveDrawingProjectFolderId()
      .then(projectFolderId => projectFolderId ? loadDrawingProjectFolder(projectFolderId) : undefined)
      .catch(() => {
        // The picker retains its full-register fallback if prefetching is unavailable.
      });
  }, [loadDrawingProjectFolder, resolveDrawingProjectFolderId]);

  const loadDrawingRegisterRoot = React.useCallback(async () => {
    setDrawingRegisterError('');
    setDrawingRegisterLoading(true);
    try {
      let projectFolderId: string | null = null;
      try {
        projectFolderId = await resolveDrawingProjectFolderId();
      } catch {
        // The full register remains available if Site Registry metadata cannot be loaded.
      }

      if (projectFolderId) {
        try {
          const {folder, breadcrumbs} = await loadDrawingProjectFolder(projectFolderId);
          const scopedBreadcrumbs = projectDrawingBreadcrumbs(breadcrumbs, projectFolderId);
          setDrawingRootFolders([]);
          setDrawingCurrentFolder(folder);
          setDrawingBreadcrumbs(scopedBreadcrumbs);
          setDrawingRegisterProjectScoped(true);
          return;
        } catch {
          setDrawingRegisterError('The linked project folder is unavailable. Showing the full ESS Design Register.');
        }
      }

      const root = drawingRootCacheRef.current
        ?? (folders.rootFolders.length > 0 ? folders.rootFolders : await api.getRootFolders());
      drawingRootCacheRef.current = root;
      setDrawingRootFolders(root);
      setDrawingCurrentFolder(null);
      setDrawingBreadcrumbs([]);
      setDrawingRegisterProjectScoped(false);
    } catch (error) {
      setDrawingRegisterError(error instanceof Error ? error.message : 'Could not load ESS Design.');
    } finally {
      setDrawingRegisterLoading(false);
    }
  }, [folders.rootFolders, loadDrawingProjectFolder, resolveDrawingProjectFolderId]);

  const openDrawingFolder = React.useCallback(async (folderId: string) => {
    setDrawingRegisterError('');
    const cached = drawingFolderCacheRef.current.get(folderId);
    if (cached) {
      setDrawingCurrentFolder(cached.folder);
      setDrawingBreadcrumbs(cached.breadcrumbs);
      return;
    }
    setDrawingRegisterLoading(true);
    try {
      const [folder, crumbs] = await Promise.all([
        api.getFolder(folderId),
        api.getBreadcrumbs(folderId),
      ]);
      const scopedBreadcrumbs = projectDrawingBreadcrumbs(
        crumbs,
        drawingRegisterProjectScoped ? drawingProjectFolderIdRef.current : null,
      );
      drawingFolderCacheRef.current.set(folderId, {folder, breadcrumbs: scopedBreadcrumbs});
      setDrawingCurrentFolder(folder);
      setDrawingBreadcrumbs(scopedBreadcrumbs);
    } catch (error) {
      setDrawingRegisterError(error instanceof Error ? error.message : 'Could not open folder.');
    } finally {
      setDrawingRegisterLoading(false);
    }
  }, [drawingRegisterProjectScoped]);

  const openDrawingRegister = React.useCallback(() => {
    setDrawingRegisterError('');
    setDrawingCurrentFolder(null);
    setDrawingBreadcrumbs([]);
    setDrawingRootFolders([]);
    setDrawingRegisterProjectScoped(Boolean(drawingProjectFolderIdRef.current));
    setShowDrawingRegister(true);

    loadDrawingRegisterRoot().catch(() => {
      // State is handled in loadDrawingRegisterRoot.
    });
  }, [loadDrawingRegisterRoot]);

  const handleDrawingRegisterButtonPress = React.useCallback(() => {
    openDrawingRegister();
    setIsDrawingNumberFocused(false);
    requestAnimationFrame(() => drawingNumberInputRef.current?.blur());
  }, [openDrawingRegister]);

  const getDrawingDocumentType = (item: DesignDocument): 'ess' | 'thirdparty' | '' => {
    if (item.essDesignIssuePath) {
      return 'ess';
    }
    if (item.thirdPartyDesignPath) {
      return 'thirdparty';
    }
    return '';
  };

  const selectDrawingRegisterDocument = React.useCallback((item: DesignDocument) => {
    const name = getDocumentDisplayName(item);
    const nextDrawingNumber = extractDrawingNumberFromDocumentName(name) || name;
    const documentType = getDrawingDocumentType(item);
    setForm(prev => ({
      ...prev,
      drawingNumber: nextDrawingNumber,
      drawingDocumentId: documentType ? item.id : '',
      drawingDocumentType: documentType,
      drawingDocumentName: name,
      drawingRevisionNumber: item.revisionNumber,
      drawingFolderId: item.folderId,
    }));
    setIsDrawingNumberFocused(false);
    setShowDrawingRegister(false);
  }, []);

  const resolveLatestRevisionDocumentFromFolder = React.useCallback(async (folder: Folder): Promise<DesignDocument | null> => {
    const selectedFolderLatestDocument = getLatestRevisionDocument(folder.documents);
    if (selectedFolderLatestDocument) {
      return selectedFolderLatestDocument;
    }

    const revisionsFolder = folder.subFolders.find(subFolder => isScaffoldRevisionsFolder(subFolder.name));
    if (!revisionsFolder) {
      return null;
    }

    const cached = drawingFolderCacheRef.current.get(revisionsFolder.id);
    if (cached) {
      return getLatestRevisionDocument(cached.folder.documents);
    }

    const loadedRevisionsFolder = await api.getFolder(revisionsFolder.id);
    drawingFolderCacheRef.current.set(revisionsFolder.id, {
      folder: loadedRevisionsFolder,
      breadcrumbs: [],
    });

    return getLatestRevisionDocument(loadedRevisionsFolder.documents);
  }, []);

  const handleDrawingFolderPress = React.useCallback(async (folder: Folder) => {
    setDrawingRegisterError('');
    setDrawingRegisterLoading(true);

    try {
      const cached = drawingFolderCacheRef.current.get(folder.id);
      let loadedFolder = cached?.folder;
      let breadcrumbs = cached?.breadcrumbs;

      if (!loadedFolder) {
        let nextFolder: Folder;
        let crumbs: BreadcrumbItem[];
        if (drawingRegisterProjectScoped) {
          nextFolder = await api.getFolder(folder.id);
          crumbs = [...drawingBreadcrumbs, {id: folder.id, name: folder.name}];
        } else {
          [nextFolder, crumbs] = await Promise.all([
            api.getFolder(folder.id),
            api.getBreadcrumbs(folder.id),
          ]);
        }
        const scopedBreadcrumbs = drawingRegisterProjectScoped
          ? crumbs
          : projectDrawingBreadcrumbs(crumbs, null);
        loadedFolder = nextFolder;
        breadcrumbs = scopedBreadcrumbs;
        drawingFolderCacheRef.current.set(folder.id, {
          folder: nextFolder,
          breadcrumbs: scopedBreadcrumbs,
        });
      }

      const latestRevision = await resolveLatestRevisionDocumentFromFolder(loadedFolder);
      if (latestRevision) {
        selectDrawingRegisterDocument(latestRevision);
        return;
      }

      if (loadedFolder.subFolders.some(subFolder => isScaffoldRevisionsFolder(subFolder.name))) {
        setDrawingRegisterError('No revision PDFs found for this scaffold.');
        return;
      }

      setDrawingCurrentFolder(loadedFolder);
      setDrawingBreadcrumbs(breadcrumbs ?? []);
    } catch (error) {
      setDrawingRegisterError(error instanceof Error ? error.message : 'Could not open folder.');
    } finally {
      setDrawingRegisterLoading(false);
    }
  }, [drawingBreadcrumbs, drawingRegisterProjectScoped, resolveLatestRevisionDocumentFromFolder, selectDrawingRegisterDocument]);

  const openLinkedDrawingDocument = React.useCallback(async () => {
    if (!form.drawingDocumentId || !form.drawingDocumentType) {
      return;
    }
    try {
      const result = await api.getDownloadUrl(form.drawingDocumentId, form.drawingDocumentType);
      navigation.navigate('PDFViewer', {
        url: result.url,
        title: form.drawingDocumentName || form.drawingNumber || 'Drawing',
      });
    } catch (error) {
      Alert.alert('Drawing unavailable', error instanceof Error ? error.message : 'Could not open the selected drawing.');
    }
  }, [form.drawingDocumentId, form.drawingDocumentName, form.drawingDocumentType, form.drawingNumber, navigation]);

  const openLinkedScaffTag = React.useCallback(() => {
    if (!form.scaffTagFormId) {
      return;
    }
    navigation.navigate('ScaffTagForm', {
      builderId: route.params.builderId,
      builderName: route.params.builderName,
      projectId: route.params.projectId,
      projectName: route.params.projectName,
      formId: form.scaffTagFormId,
      readOnly: true,
    });
  }, [
    form.scaffTagFormId,
    navigation,
    route.params.builderId,
    route.params.builderName,
    route.params.projectId,
    route.params.projectName,
  ]);

  const drawingBrowserItems = React.useMemo<DrawingBrowserItem[]>(() => {
    if (!drawingCurrentFolder) {
      return drawingRootFolders
        .filter(folder => !isScaffoldRevisionsFolder(folder.name))
        .map(folder => ({type: 'folder' as const, data: folder}));
    }
    return [
      ...drawingCurrentFolder.subFolders
        .filter(folder => !isScaffoldRevisionsFolder(folder.name))
        .map(folder => ({type: 'folder' as const, data: folder})),
      ...drawingCurrentFolder.documents.map(document => ({type: 'document' as const, data: document})),
    ];
  }, [drawingCurrentFolder, drawingRootFolders]);

  const openSignatureModal = (target: SignatureTarget) => {
    if (isReadOnly) {
      return;
    }
    setSignatureTarget(target);
    setShowSignatureModal(true);
  };

  const applySignature = (strokes: SignaturePadStroke[]) => {
    if (signatureTarget === 'ess') {
      setForm(prev => ({
        ...prev,
        essRepresentativeSignature: '',
        essRepresentativeSignatureStrokes: strokes,
      }));
    } else {
      setForm(prev => ({
        ...prev,
        clientSignature: '',
        clientSignatureStrokes: strokes,
      }));
    }
    setShowSignatureModal(false);
  };

  const pickPhoto = async (slot: number) => {
    if (isReadOnly) {
      return;
    }
    Alert.alert('Add Photo', 'Choose image source', [
      {
        text: 'Take Photo',
        onPress: () => {
          (async () => {
            try {
              const picked = await pickProfileImage('camera');
              setPendingPhotos(prev => [
                ...prev.filter(item => item.slot !== slot),
                {
                  slot,
                  uri: picked.uri,
                  fileName: picked.fileName || `handover-${slot + 1}.jpg`,
                },
              ]);
            } catch (e) {
              const message = e instanceof Error ? e.message : '';
              if (!message.includes('E_PICKER_CANCELLED')) {
                Alert.alert('Photo unavailable', message || 'Could not add photo.');
              }
            }
          })().catch(() => {
            // handled above
          });
        },
      },
      {
        text: 'Choose Existing',
        onPress: () => {
          (async () => {
            try {
              const picked = await pickProfileImage('library');
              setPendingPhotos(prev => [
                ...prev.filter(item => item.slot !== slot),
                {
                  slot,
                  uri: picked.uri,
                  fileName: picked.fileName || `handover-${slot + 1}.jpg`,
                },
              ]);
            } catch (e) {
              const message = e instanceof Error ? e.message : '';
              if (!message.includes('E_PICKER_CANCELLED')) {
                Alert.alert('Photo unavailable', message || 'Could not add photo.');
              }
            }
          })().catch(() => {
            // handled above
          });
        },
      },
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const handleSave = async () => {
    if (isReadOnly) {
      return;
    }
    if (!form.projectNumberClient.trim()) {
      Alert.alert('Project/client required', 'Enter the project and client field before saving.');
      return;
    }

    setSaving(true);
    try {
      const nextId = formId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const uploadedPhotos = existingPhotos.map(item => ({slot: item.slot, path: item.path}));

      if (pendingPhotos.length > 0) {
        const nextUploads = await Promise.all(
          pendingPhotos.map(async item => ({
            slot: item.slot,
            path: await uploadHandoverCertificatePhoto(
              route.params.builderId,
              route.params.projectId,
              nextId,
              item.slot,
              item.uri,
              item.fileName,
            ),
          })),
        );

        nextUploads.forEach(upload => {
          const index = uploadedPhotos.findIndex(item => item.slot === upload.slot);
          if (index >= 0) {
            uploadedPhotos[index] = upload;
          } else {
            uploadedPhotos.push(upload);
          }
        });
      }

      const savedAt = nowStamp();
      const saved = await saveHandoverCertificateForm({
        id: nextId,
        createdAt,
        builderId: route.params.builderId,
        builderName: route.params.builderName,
        projectId: route.params.projectId,
        projectName: route.params.projectName,
        companyEntityId: form.companyEntityId,
        inspectionNumber: form.inspectionNumber.trim(),
        formReferenceName: form.formReferenceName.trim(),
        scaffoldRegisterId,
        inspectionDateTime: savedAt,
        projectNumberClient: form.projectNumberClient.trim(),
        sectionLocation: form.sectionLocation.trim(),
        intendedUse: form.intendedUse.trim(),
        drawingNumber: form.drawingNumber.trim(),
        scaffTagId: form.scaffTagId.trim(),
        scaffTagFormId: form.scaffTagFormId,
        drawingDocumentId: form.drawingDocumentId,
        drawingDocumentType: form.drawingDocumentType,
        drawingDocumentName: form.drawingDocumentName,
        drawingRevisionNumber: form.drawingRevisionNumber,
        drawingFolderId: form.drawingFolderId,
        scaffoldLength: form.scaffoldLength.trim(),
        scaffoldIdNo: form.scaffoldIdNo.trim(),
        baysLong: form.baysLong.trim(),
        scaffoldHeight: form.scaffoldHeight.trim(),
        workingDecks: form.workingDecks.trim(),
        accessType: form.accessType,
        scaffoldDuty: form.scaffoldDuty,
        checklist: form.checklist,
        correctiveActions: form.correctiveActions,
        photoSlots: uploadedPhotos,
        comments: form.comments.trim(),
        essRepresentativeName: form.essRepresentativeName.trim(),
        essRepresentativeSignature: form.essRepresentativeSignature.trim(),
        essRepresentativeSignatureStrokes: form.essRepresentativeSignatureStrokes,
        clientName: form.clientName.trim(),
        clientSignature: form.clientSignature.trim(),
        clientSignatureStrokes: form.clientSignatureStrokes,
        hrwLicenceNumber: form.hrwLicenceNumber.trim(),
      });

      const savedFormState: FormState = {
        companyEntityId: saved.companyEntityId,
        inspectionNumber: saved.inspectionNumber,
        formReferenceName: saved.formReferenceName,
        inspectionDateTime: saved.inspectionDateTime,
        projectNumberClient: saved.projectNumberClient,
        sectionLocation: saved.sectionLocation,
        intendedUse: saved.intendedUse,
        drawingNumber: saved.drawingNumber,
        scaffTagId: saved.scaffTagId,
        scaffTagFormId: saved.scaffTagFormId,
        drawingDocumentId: saved.drawingDocumentId,
        drawingDocumentType: saved.drawingDocumentType,
        drawingDocumentName: saved.drawingDocumentName,
        drawingRevisionNumber: saved.drawingRevisionNumber,
        drawingFolderId: saved.drawingFolderId,
        scaffoldLength: saved.scaffoldLength,
        scaffoldIdNo: saved.scaffoldIdNo,
        baysLong: saved.baysLong,
        scaffoldHeight: saved.scaffoldHeight,
        workingDecks: saved.workingDecks,
        accessType: saved.accessType,
        scaffoldDuty: saved.scaffoldDuty,
        checklist: saved.checklist,
        correctiveActions: saved.correctiveActions,
        comments: saved.comments,
        essRepresentativeName: saved.essRepresentativeName,
        essRepresentativeSignature: saved.essRepresentativeSignature,
        essRepresentativeSignatureStrokes: saved.essRepresentativeSignatureStrokes,
        clientName: saved.clientName,
        clientSignature: saved.clientSignature,
        clientSignatureStrokes: saved.clientSignatureStrokes,
        hrwLicenceNumber: saved.hrwLicenceNumber,
      };
      baselineSnapshotRef.current = serializeFormState(savedFormState);
      setForm(savedFormState);
      setFormId(saved.id);
      setScaffoldRegisterId(saved.scaffoldRegisterId);
      setCreatedAt(saved.createdAt);
      const photoUrls = await Promise.all(
        saved.photoSlots.map(async item => ({
          slot: item.slot,
          path: item.path,
          url: await getHandoverCertificatePhotoUrl(item.path),
        })),
      );
      setExistingPhotos(photoUrls);
      setPendingPhotos([]);
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'Unable to save handover certificate.';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!formId || hasUnsavedChanges) {
      return;
    }

    setOpeningShare(true);
    setShareRecipientsLoading(notificationRecipients.length === 0);
    loadNotificationRecipients()
      .catch(() => {
        // The modal can still show external-recipient entry if loading fails.
      })
      .finally(() => setShareRecipientsLoading(false));
    try {
      const url = await getHandoverCertificatePdfUrl({
        builderId: route.params.builderId,
        projectId: route.params.projectId,
        formId,
      });
      setSharePdfUrl(url);
      setShowShareModal(true);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Could not load the handover PDF.';
      Alert.alert('PDF unavailable', message);
    } finally {
      setOpeningShare(false);
    }
  };

  const handleProjectDataShare = async (selection: ProjectDataShareSelection) => {
    if (!sharePdfUrl) {
      return;
    }

    setShareSending(true);
    try {
      const formTitle = form.formReferenceName || form.inspectionNumber || 'Handover Certificate';
      await api.shareProjectDataForm({
        recipientUserIds: selection.internalRecipients.map(recipient => recipient.id),
        externalEmails: selection.externalEmails,
        formType: 'Handover Certificate',
        formTitle,
        formNumber: form.inspectionNumber || inspectionNumberPreview,
        builderName: route.params.builderName,
        projectName: route.params.projectName,
        pdfUrl: sharePdfUrl,
      });
      setShowShareModal(false);
      const recipientCount = selection.internalRecipients.length + selection.externalEmails.length;
      Alert.alert(
        'PDF Shared',
        `Shared with ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Could not share the handover PDF.';
      Alert.alert('Share Failed', message);
    } finally {
      setShareSending(false);
    }
  };

  const handleProjectDataEmailAttachment = async (
    selection: ProjectDataShareSelection,
  ) => {
    if (!sharePdfUrl) {
      return;
    }

    const recipients = collectProjectDataRecipientEmails(
      selection.internalRecipients,
      selection.externalEmails,
    );
    if (recipients.length === 0) {
      Alert.alert('Email unavailable', 'Select at least one recipient with an email address.');
      return;
    }

    const formTitle = form.formReferenceName || form.inspectionNumber || 'Handover Certificate';
    const formNumber = form.inspectionNumber || inspectionNumberPreview;
    setShareEmailingAttachment(true);
    try {
      const result = await composeEmailWithPdf({
        to: recipients,
        subject: `${formTitle} – ${formNumber}`,
        body: `Please find attached the Handover Certificate PDF for ${route.params.projectName}.`,
        pdfUrl: sharePdfUrl,
        fileName: projectDataPdfFileName(`Handover Certificate ${formNumber}`),
      });
      if (result !== 'cancelled') {
        setShowShareModal(false);
      }
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Could not open the email composer.';
      Alert.alert('Email Failed', message);
    } finally {
      setShareEmailingAttachment(false);
    }
  };

  const renderStatusSelectorWithStyles = (
    activeStyles: ScreenStyles,
    itemId: string,
    isStatic = false,
  ) => (
    <View style={activeStyles.statusGroup}>
      {(['YES', 'NO', 'NA'] as HandoverChecklistStatus[]).map(value => {
        const active = form.checklist[itemId] === value;
        return (
          <TouchableOpacity
            key={`${itemId}-${value}-${isStatic ? 'static' : 'live'}`}
            style={[activeStyles.statusPill, active ? activeStyles.statusPillActive : null]}
            disabled={isReadOnly || isStatic}
            onPress={() => updateChecklist(itemId, value)}>
            <Text style={[activeStyles.statusPillText, active ? activeStyles.statusPillTextActive : null]}>{value}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderChecklistSectionWithStyles = (
    activeStyles: ScreenStyles,
    title: string,
    items: ChecklistItem[],
    isStatic = false,
  ) => (
    <View style={activeStyles.pageSection}>
      <View style={activeStyles.sectionBand}>
        <Text style={activeStyles.sectionBandText}>{title}</Text>
      </View>
      <View style={activeStyles.checklistCard}>
        {items.map(item => (
          <View key={`${title}-${item.id}-${isStatic ? 'static' : 'live'}`} style={activeStyles.checklistRow}>
            <Text style={activeStyles.checklistLabel}>{item.label}</Text>
            {renderStatusSelectorWithStyles(activeStyles, item.id, isStatic)}
          </View>
        ))}
      </View>
    </View>
  );

  const renderSignatureBoxWithStyles = (
    activeStyles: ScreenStyles,
    target: SignatureTarget,
    label: string,
    name: string,
    strokes: SignatureStroke[],
    onNameChange: (value: string) => void,
    isStatic = false,
  ) => (
    <View style={activeStyles.signatureField}>
      <Text style={activeStyles.signatureLabel}>{label} NAME:</Text>
      <TextInput
        style={activeStyles.signatureNameInput}
        editable={!isReadOnly && !isStatic}
        selectTextOnFocus={!isStatic}
        value={name}
        onChangeText={onNameChange}
        placeholder="Name"
        placeholderTextColor={theme.textSecondary}
      />
      <Text style={activeStyles.signatureLabel}>{label} SIGNATURE:</Text>
      <TouchableOpacity
        activeOpacity={isReadOnly || isStatic ? 1 : 0.85}
        style={activeStyles.signatureBox}
        disabled={isReadOnly || isStatic}
        onPress={() => openSignatureModal(target)}
        onLayout={evt => {
          if (isStatic) {
            return;
          }
          const nextSize = readLayoutSize(evt);
          setSignaturePreviewSize(prev => ({
            ...prev,
            [target]: nextSize,
          }));
        }}>
        {strokes.length > 0 ? (
          renderSignatureStrokes(
            strokes,
            isStatic ? 420 : signaturePreviewSize[target].width,
            isStatic ? 112 : signaturePreviewSize[target].height,
          )
        ) : (
          <Text style={activeStyles.signaturePlaceholder}>{isStatic ? '' : 'Tap to sign'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderInlineScaffTagSuggestion = (positionStyle?: ViewStyle) => suggestedScaffTags.length > 0 && !isReadOnly ? (
    <View style={[styles.inlineScaffTagDropdown, positionStyle]}>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={suggestedScaffTags.length > 4}>
        {suggestedScaffTags.map((scaffTag, index) => (
          <TouchableOpacity
            key={scaffTag.id}
            activeOpacity={0.72}
            style={[
              styles.inlineScaffTagSuggestion,
              index < suggestedScaffTags.length - 1
                ? styles.inlineScaffTagSuggestionDivider
                : null,
            ]}
            onPress={() => selectScaffTag(scaffTag)}>
            <View style={styles.inlineScaffTagSuggestionCopy}>
              <Text style={styles.inlineScaffTagSuggestionLabel}>Scaff-Tag match</Text>
              <Text style={styles.inlineScaffTagSuggestionName} numberOfLines={1}>
                {scaffTag.scaffoldNo || 'Scaff-Tag'}
              </Text>
            </View>
            <Text style={styles.inlineScaffTagSuggestionReference}>
              {scaffTag.tagNumber ? `ST-${scaffTag.tagNumber}` : ''}
            </Text>
            <Text style={styles.inlineScaffTagSuggestionChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  ) : null;

  const renderFirstSheet = (
    activeStyles: ScreenStyles,
    isStatic = false,
  ) => (
    <View style={activeStyles.sheet}>
      <View style={activeStyles.sheetHeader}>
        <View style={activeStyles.brandBlock}>
          <Image source={company.logo} style={activeStyles.essLogo} resizeMode="contain" />
          <View style={activeStyles.brandTextWrap}>
            <Text style={activeStyles.brandText}>{company.legalName}</Text>
            <Text style={activeStyles.brandSubText}>ABN: {company.abn}</Text>
            <Text style={activeStyles.brandSubText}>Office Address: {company.officeAddress}</Text>
            <Text style={activeStyles.brandSubText}>PH: {company.phone}   FAX: {company.fax}</Text>
          </View>
        </View>
        <View style={activeStyles.headerRight}>
          <Text style={activeStyles.documentTitle}>{companyFormTitle(company.id, 'Handover Certificate')}</Text>
          <View style={activeStyles.inspectionRow}>
            <Text style={activeStyles.inspectionLabel}>Inspection No.</Text>
            <TextInput
              style={activeStyles.inspectionInput}
              value={form.inspectionNumber || inspectionNumberPreview}
              editable={false}
              selectTextOnFocus={false}
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        </View>
      </View>

      <View style={activeStyles.sectionBand}>
        <Text style={activeStyles.sectionBandText}>DETAILS</Text>
      </View>

      <View style={activeStyles.detailsTable}>
        {DETAILS_FIELDS.map(field => (
          <React.Fragment key={`${field.key}-${isStatic ? 'static' : 'live'}`}>
            <View style={[
              activeStyles.tableRow,
              field.key === 'formReferenceName' ? activeStyles.referenceNameTableRow : null,
            ]}>
              <Text style={activeStyles.tableLabel}>{field.label}</Text>
              <View style={activeStyles.referenceNameInputWrap}>
                <TextInput
                  style={[activeStyles.tableInput, field.multiline ? activeStyles.tableInputMultiline : null]}
                  editable={!isReadOnly && !isStatic && field.key !== 'inspectionDateTime'}
                  selectTextOnFocus={!isStatic}
                  multiline={field.multiline}
                  value={form[field.key]}
                  onChangeText={value => updateField(field.key, value)}
                  placeholder={field.label}
                  placeholderTextColor={theme.textSecondary}
                />
                {field.key === 'formReferenceName' && !isReadOnly && !isStatic ? (
                  <TouchableOpacity
                    style={activeStyles.referenceNameRegisterButton}
                    onPress={() => setShowScaffTagPicker(true)}>
                    <Text style={activeStyles.referenceNameRegisterButtonText}>Search register</Text>
                  </TouchableOpacity>
                ) : null}
                {field.key === 'formReferenceName' && !isStatic
                  ? renderInlineScaffTagSuggestion(activeStyles.desktopScaffTagDropdownPosition)
                  : null}
              </View>
            </View>
          </React.Fragment>
        ))}
        <View style={activeStyles.metricsGrid}>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>Intended use</Text>
            <TextInput
              style={activeStyles.metricSideInput}
              editable={!isReadOnly && !isStatic}
              selectTextOnFocus={!isStatic}
              value={form.intendedUse}
              onChangeText={value => updateField('intendedUse', value)}
            />
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>No. of working decks</Text>
            <TextInput
              style={activeStyles.metricSideInput}
              editable={!isReadOnly && !isStatic}
              selectTextOnFocus={!isStatic}
              value={form.workingDecks}
              onChangeText={value => updateNumericField('workingDecks', value)}
              keyboardType="number-pad"
            />
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>Scaffold Length</Text>
            <TextInput
              style={activeStyles.metricSideInput}
              editable={!isReadOnly && !isStatic}
              selectTextOnFocus={!isStatic}
              value={isStatic ? (form.scaffoldLength ? `${form.scaffoldLength}m` : '') : (isEditingScaffoldLength || !form.scaffoldLength ? form.scaffoldLength : `${form.scaffoldLength}m`)}
              onFocus={() => setIsEditingScaffoldLength(true)}
              onBlur={() => setIsEditingScaffoldLength(false)}
              onChangeText={value => updateNumericField('scaffoldLength', value)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>Scaffold ID No</Text>
            <TextInput
              style={activeStyles.metricSideInput}
              editable={!isReadOnly && !isStatic}
              selectTextOnFocus={!isStatic}
              value={form.scaffoldIdNo}
              onChangeText={value => updateNumericField('scaffoldIdNo', value)}
              keyboardType="number-pad"
            />
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>No. of bays long</Text>
            <TextInput
              style={activeStyles.metricSideInput}
              editable={!isReadOnly && !isStatic}
              selectTextOnFocus={!isStatic}
              value={form.baysLong}
              onChangeText={value => updateNumericField('baysLong', value)}
              keyboardType="number-pad"
            />
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>Scaffold Height</Text>
            <TextInput
              style={activeStyles.metricSideInput}
              editable={!isReadOnly && !isStatic}
              selectTextOnFocus={!isStatic}
              value={isStatic ? (form.scaffoldHeight ? `${form.scaffoldHeight}m` : '') : (isEditingScaffoldHeight || !form.scaffoldHeight ? form.scaffoldHeight : `${form.scaffoldHeight}m`)}
              onFocus={() => setIsEditingScaffoldHeight(true)}
              onBlur={() => setIsEditingScaffoldHeight(false)}
              onChangeText={value => updateNumericField('scaffoldHeight', value)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>Drawing Number</Text>
            <View style={activeStyles.drawingNumberInputWrap}>
              {form.drawingDocumentId && form.drawingNumber && !isDrawingNumberFocused && !isStatic ? (
                <Pressable
                  style={activeStyles.drawingNumberLinkedInput}
                  onPress={() => {
                    setIsDrawingNumberFocused(true);
                    requestAnimationFrame(() => drawingNumberInputRef.current?.focus());
                  }}>
                  <TouchableOpacity style={activeStyles.drawingNumberLinkTapArea} onPress={openLinkedDrawingDocument}>
                    <Text style={activeStyles.drawingNumberLinkText} numberOfLines={1}>
                      {form.drawingNumber}
                      {form.drawingRevisionNumber ? ` · Rev ${form.drawingRevisionNumber}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    ref={drawingNumberInputRef}
                    style={activeStyles.drawingNumberHiddenInput}
                    editable={!isReadOnly && !isStatic}
                    value={form.drawingNumber}
                    onFocus={() => setIsDrawingNumberFocused(true)}
                    onChangeText={value => setForm(prev => ({
                      ...prev,
                      drawingNumber: value,
                      drawingDocumentId: '',
                      drawingDocumentType: '',
                      drawingDocumentName: '',
                      drawingRevisionNumber: '',
                      drawingFolderId: '',
                    }))}
                  />
                </Pressable>
              ) : (
                <TextInput
                  ref={drawingNumberInputRef}
                  style={activeStyles.drawingNumberInput}
                  editable={!isReadOnly && !isStatic}
                  selectTextOnFocus={!isStatic}
                  value={form.drawingNumber}
                  onFocus={() => setIsDrawingNumberFocused(true)}
                  onBlur={() => {
                    if (!showDrawingRegister) {
                      setIsDrawingNumberFocused(false);
                    }
                  }}
                  onChangeText={value => setForm(prev => ({
                    ...prev,
                    drawingNumber: value,
                    drawingDocumentId: '',
                    drawingDocumentType: '',
                    drawingDocumentName: '',
                    drawingRevisionNumber: '',
                    drawingFolderId: '',
                  }))}
                />
              )}
              {!isReadOnly && !isStatic && isDrawingNumberFocused ? (
                <TouchableOpacity
                  style={activeStyles.drawingRegisterInlineButton}
                  onPressIn={handleDrawingRegisterButtonPress}>
                  <Text style={activeStyles.drawingRegisterInlineButtonText}>Search register</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={activeStyles.metricCell}>
            <Text style={activeStyles.metricSideLabel}>Scaff-Tag ID</Text>
            {form.scaffTagFormId && form.scaffTagId && !isStatic ? (
              <View style={activeStyles.linkedReferenceEditRow}>
                <TouchableOpacity
                  style={activeStyles.linkedReferenceButton}
                  activeOpacity={0.75}
                  onPress={openLinkedScaffTag}>
                  <Text style={activeStyles.linkedReferenceText} numberOfLines={1}>
                    {form.scaffTagId}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TextInput
                style={activeStyles.metricSideInput}
                editable={false}
                selectTextOnFocus={false}
                value={form.scaffTagId}
                placeholder={isStatic ? undefined : EMPTY_SCAFF_TAG_ID_PLACEHOLDER}
                placeholderTextColor="#8A8A8A"
              />
            )}
          </View>
        </View>
      </View>

      <View style={activeStyles.optionRows}>
        <View style={activeStyles.optionRow}>
          <Text style={activeStyles.optionRowLabel}>Access:</Text>
          <View style={activeStyles.optionRowChoices}>
            {([
              ['stretcher-stair', 'Stretcher Stair'],
              ['aluminium-access-stair', 'Aluminium stair'],
              ['ladder-access', 'Ladder access'],
            ] as Array<[HandoverAccessType, string]>).map(([value, label]) => {
              const active = form.accessType === value;
              return (
                <TouchableOpacity
                  key={`${value}-${isStatic ? 'static' : 'live'}`}
                  style={[activeStyles.checkboxChoice, activeStyles.checkboxChoiceWide]}
                  disabled={isReadOnly || isStatic}
                  onPress={() => updateField('accessType', form.accessType === value ? '' : value)}>
                  <View style={activeStyles.checkboxChoiceInner}>
                    <View style={activeStyles.checkboxSquareWrap}>
                      <View style={[activeStyles.checkboxSquare, active ? activeStyles.checkboxSquareActive : null]}>
                        {active ? <Text style={activeStyles.checkboxTick}>X</Text> : null}
                      </View>
                    </View>
                    <Text style={activeStyles.checkboxChoiceText}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={activeStyles.optionRow}>
          <Text style={activeStyles.optionRowLabel}>Scaffold Duty:</Text>
          <View style={activeStyles.optionRowChoices}>
            {([
              ['LIGHT', 'Light 225kg'],
              ['MEDIUM', 'Medium 450kg'],
              ['HEAVY', 'Heavy 675kg'],
            ] as Array<[HandoverScaffoldDuty, string]>).map(([value, label]) => {
              const active = form.scaffoldDuty === value;
              return (
                <TouchableOpacity
                  key={`${value}-${isStatic ? 'static' : 'live'}`}
                  style={[activeStyles.checkboxChoice, activeStyles.checkboxChoiceWide]}
                  disabled={isReadOnly || isStatic}
                  onPress={() => updateField('scaffoldDuty', form.scaffoldDuty === value ? '' : value)}>
                  <View style={activeStyles.checkboxChoiceInner}>
                    <View style={activeStyles.checkboxSquareWrap}>
                      <View style={[activeStyles.checkboxSquare, active ? activeStyles.checkboxSquareActive : null]}>
                        {active ? <Text style={activeStyles.checkboxTick}>X</Text> : null}
                      </View>
                    </View>
                    <Text style={activeStyles.checkboxChoiceText}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={activeStyles.pageColumns}>
        <View style={activeStyles.pageColumn}>
          {renderChecklistSectionWithStyles(activeStyles, 'SCAFFOLD VICINITY', SCAFFOLD_VICINITY, isStatic)}
          {renderChecklistSectionWithStyles(activeStyles, 'SUPPORTING STRUCTURES', SUPPORTING_STRUCTURES, isStatic)}
          {renderChecklistSectionWithStyles(activeStyles, 'SCAFFOLD STRUCTURES', SCAFFOLD_STRUCTURES, isStatic)}
        </View>
      </View>

      <View style={activeStyles.pageSection}>
        <View style={activeStyles.sectionBand}>
          <Text style={activeStyles.sectionBandText}>CORRECTIVE ACTIONS</Text>
        </View>
        <View style={activeStyles.correctiveTable}>
          <View style={activeStyles.correctiveHeaderRow}>
            <Text style={[activeStyles.correctiveHeaderText, activeStyles.correctiveActionCol]}>Action Required</Text>
            <Text style={[activeStyles.correctiveHeaderText, activeStyles.correctiveByCol]}>Completed by</Text>
            <Text style={[activeStyles.correctiveHeaderText, activeStyles.correctiveDateCol]}>Date</Text>
          </View>
          {form.correctiveActions.map((row, index) => (
            <View key={`action-${index}-${isStatic ? 'static' : 'live'}`} style={activeStyles.correctiveRow}>
              <TextInput
                style={[activeStyles.correctiveInput, activeStyles.correctiveActionCol]}
                editable={!isReadOnly && !isStatic}
                selectTextOnFocus={!isStatic}
                multiline
                value={row.actionRequired}
                onChangeText={value => updateActionRow(index, 'actionRequired', value)}
              />
              <TextInput
                style={[activeStyles.correctiveInput, activeStyles.correctiveByCol]}
                editable={!isReadOnly && !isStatic}
                selectTextOnFocus={!isStatic}
                multiline
                value={row.completedBy}
                onChangeText={value => updateActionRow(index, 'completedBy', value)}
              />
              <TextInput
                style={[activeStyles.correctiveInput, activeStyles.correctiveDateCol]}
                editable={!isReadOnly && !isStatic}
                selectTextOnFocus={!isStatic}
                multiline
                value={row.date}
                onChangeText={value => updateActionRow(index, 'date', value)}
              />
            </View>
          ))}
        </View>
      </View>

      <Text style={activeStyles.footerText}>
        The above scaffolding has been erected in accordance with AS 1576 parts 1-6 and the model WHS Regulations and model Code of Practice: Managing Risks for Scaffolds; be informed by relevant technical standards; has been erected having regard to SWMS for this project and is suitable for its intended service. PLANT REGISTRATION NUMBER: PFS 65-60781/04
      </Text>
    </View>
  );

  const renderSecondSheet = (
    activeStyles: ScreenStyles,
    isStatic = false,
  ) => (
    <View style={activeStyles.sheet}>
      <View style={activeStyles.sheetHeader}>
        <View style={activeStyles.brandBlock}>
          <Image source={company.logo} style={activeStyles.essLogo} resizeMode="contain" />
          <View style={activeStyles.brandTextWrap}>
            <Text style={activeStyles.brandText}>{company.legalName}</Text>
            <Text style={activeStyles.brandSubText}>ABN: {company.abn}</Text>
            <Text style={activeStyles.brandSubText}>Office Address: {company.officeAddress}</Text>
            <Text style={activeStyles.brandSubText}>PH: {company.phone}   FAX: {company.fax}</Text>
          </View>
        </View>
      </View>

      <View style={activeStyles.sectionBand}>
        <Text style={activeStyles.sectionBandText}>PHOTOS</Text>
      </View>
      <View style={activeStyles.photosGrid}>
        {PHOTO_SLOTS.map(slot => {
          const photo = getPhotoForSlot(slot);
          return (
            <TouchableOpacity
              key={`photo-slot-${slot}-${isStatic ? 'static' : 'live'}`}
              style={activeStyles.photoSlot}
              activeOpacity={isReadOnly || isStatic ? 1 : 0.85}
              disabled={isReadOnly || isStatic}
              onPress={() => pickPhoto(slot)}>
              {photo ? (
                <Image source={photo} style={activeStyles.photoImage} resizeMode="cover" />
              ) : (
                <View style={activeStyles.photoPlaceholder}>
                  <Text style={activeStyles.photoPlaceholderIcon}>Photo</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={activeStyles.pageSection}>
        <View style={[activeStyles.sectionBand, activeStyles.commentsBand]}>
          <Text style={activeStyles.commentsBandText}>Comments / Alterations / Details</Text>
        </View>
        <TextInput
          style={activeStyles.commentsInput}
          editable={!isReadOnly && !isStatic}
          selectTextOnFocus={!isStatic}
          multiline
          value={form.comments}
          onChangeText={value => updateField('comments', value)}
        />
      </View>

      <View style={activeStyles.signatureGrid}>
        {renderSignatureBoxWithStyles(
          activeStyles,
          'ess',
          representativeLabel,
          form.essRepresentativeName,
          form.essRepresentativeSignatureStrokes,
          value => updateField('essRepresentativeName', value),
          isStatic,
        )}
        {renderSignatureBoxWithStyles(
          activeStyles,
          'client',
          'CLIENT',
          form.clientName,
          form.clientSignatureStrokes,
          value => updateField('clientName', value),
          isStatic,
        )}
      </View>

      <View style={activeStyles.licenceRow}>
        <Text style={activeStyles.signatureLabel}>HRW LICENCE NUMBER:</Text>
        <TextInput
          style={activeStyles.licenceInput}
          editable={!isReadOnly && !isStatic}
          selectTextOnFocus={!isStatic}
          value={form.hrwLicenceNumber}
          onChangeText={value => updateField('hrwLicenceNumber', value)}
        />
      </View>

      {!isStatic && hasUnsavedChanges ? (
        <View style={activeStyles.formPageSaveArea}>
          <TouchableOpacity style={activeStyles.saveButton} disabled={saving} onPress={handleSave}>
            {saving ? <ActivityIndicator size="small" color="#111827" /> : <Text style={activeStyles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const renderIPhoneDetailsTable = () => (
    <View
      pointerEvents="none"
      style={[
        styles.iPhoneDetailsTablePatch,
        phoneFormBoxStyle({left: 63, top: 159.5, width: 683, height: 214}),
      ]}>
      <View style={styles.iPhoneDetailsTableGrid}>
        <View style={styles.iPhoneDetailsTableHeader}>
          <Text style={styles.iPhoneDetailsTableHeaderText}>DETAILS</Text>
        </View>
        {[
          'Form Reference Name',
          'Date/Time of inspection',
          'Project Number / Client',
          'Section/location of scaffold',
        ].map((label, index) => (
          <View key={`iphone-detail-full-row-${index}`} style={styles.iPhoneDetailsFullRow}>
            <View style={styles.iPhoneDetailsFullLabelCell}>
              <Text style={[
                styles.iPhoneDetailsTableLabel,
                index === 0 ? styles.iPhoneDetailsReferenceLabel : null,
              ]}>{label}</Text>
            </View>
            <View style={styles.iPhoneDetailsFullValueCell} />
          </View>
        ))}
        {[
          ['Intended use', 'No. of working decks'],
          ['Scaffold Length', 'Scaffold ID No'],
          ['No. of bays long', 'Scaffold Height'],
          ['Drawing Number', 'Scaff-Tag ID'],
        ].map((labels, index) => (
          <View
            key={`iphone-compact-detail-row-${index}`}
            style={[
              styles.iPhoneDetailsPairedRow,
              index === 0 ? styles.iPhoneDetailsLeadPairedRow : null,
            ]}>
            <View style={styles.iPhoneDetailsLeftLabelCell}>
              <Text style={styles.iPhoneDetailsTableLabel}>{labels[0]}</Text>
            </View>
            <View style={styles.iPhoneDetailsLeftValueCell} />
            <View style={styles.iPhoneDetailsRightLabelCell}>
              <Text style={styles.iPhoneDetailsTableLabel}>{labels[1]}</Text>
            </View>
            <View style={styles.iPhoneDetailsRightValueCell} />
          </View>
        ))}
      </View>
    </View>
  );

  const renderIPhoneDetailInputs = () => (
    <>
      {PHONE_DETAIL_FIELDS.map(field => {
        const isLength = field.key === 'scaffoldLength';
        const isHeight = field.key === 'scaffoldHeight';
        const isDrawing = field.key === 'drawingNumber';
        const isScaffTag = field.key === 'scaffTagId';
        const isRegisterControlled = isScaffoldRegisterLinked && (
          field.key === 'formReferenceName' || field.key === 'projectNumberClient'
        );
        const isLinkedReferenceLocked = (isDrawing && isDrawingLinked)
          || isScaffTag;
        const isFieldLocked = isRegisterControlled || isLinkedReferenceLocked;
        const displayValue = field.key === 'inspectionNumber'
          ? form.inspectionNumber || inspectionNumberPreview
          : isLength && form.scaffoldLength && !isEditingScaffoldLength
            ? `${form.scaffoldLength}m`
            : isHeight && form.scaffoldHeight && !isEditingScaffoldHeight
              ? `${form.scaffoldHeight}m`
              : form[field.key];

        const linkedOnPress = isDrawing && form.drawingDocumentId && form.drawingNumber
          ? openLinkedDrawingDocument
          : isScaffTag && form.scaffTagFormId && form.scaffTagId
            ? openLinkedScaffTag
            : undefined;

        if (linkedOnPress) {
          return (
            <View
              key={`iphone-field-${field.key}`}
              style={[
                styles.iPhoneLinkedReferenceRow,
                phoneFormBoxStyle(field.box),
              ]}>
              <TouchableOpacity
                style={styles.iPhoneLinkedReferenceButton}
                activeOpacity={0.75}
                accessibilityRole="link"
                accessibilityLabel={`Open linked ${field.label}`}
                onPress={linkedOnPress}>
                <Text
                  style={[
                    styles.iPhoneLinkedReferenceText,
                    isFieldLocked && !isDrawing && !isScaffTag
                      ? styles.iPhoneLockedFieldText
                      : null,
                  ]}
                  numberOfLines={1}>
                  {form[field.key]}
                </Text>
              </TouchableOpacity>
              {!isReadOnly && !isFieldLocked ? (
                <TextInput
                  ref={isDrawing ? drawingNumberInputRef : undefined}
                  style={styles.iPhoneLinkedReferenceEditInput}
                  accessibilityLabel={`Edit ${field.label}`}
                  onFocus={() => {
                    if (isDrawing) {
                      setIsDrawingNumberFocused(true);
                    }
                  }}
                  onBlur={() => {
                    if (isDrawing && !showDrawingRegister) {
                      setIsDrawingNumberFocused(false);
                    }
                  }}
                  onChangeText={value => {
                    if (isDrawing) {
                      setForm(previous => ({
                        ...previous,
                        drawingNumber: value,
                        drawingDocumentId: '',
                        drawingDocumentType: '',
                        drawingDocumentName: '',
                        drawingRevisionNumber: '',
                        drawingFolderId: '',
                      }));
                      return;
                    }
                    setForm(previous => ({...previous, scaffTagId: value, scaffTagFormId: ''}));
                  }}
                  onKeyPress={({nativeEvent}) => {
                    if (nativeEvent.key !== 'Backspace') {
                      return;
                    }
                    if (isDrawing) {
                      setForm(previous => ({
                        ...previous,
                        drawingNumber: '',
                        drawingDocumentId: '',
                        drawingDocumentType: '',
                        drawingDocumentName: '',
                        drawingRevisionNumber: '',
                        drawingFolderId: '',
                      }));
                    } else {
                      setForm(previous => ({...previous, scaffTagId: '', scaffTagFormId: ''}));
                    }
                  }}
                />
              ) : null}
            </View>
          );
        }

        return (
          <TextInput
            key={`iphone-field-${field.key}`}
            ref={isDrawing ? drawingNumberInputRef : undefined}
            style={[
              styles.iPhoneDocumentInput,
              field.key === 'inspectionNumber' ? styles.iPhoneInspectionInput : null,
              isFieldLocked ? styles.iPhoneLockedFieldText : null,
              phoneFormBoxStyle(field.box),
            ]}
            accessibilityLabel={field.label}
            editable={!isReadOnly
              && !isFieldLocked
              && field.key !== 'inspectionNumber'
              && field.key !== 'inspectionDateTime'}
            selectTextOnFocus
            keyboardType={field.keyboardType ?? 'default'}
            value={displayValue}
            placeholder={isScaffTag ? EMPTY_SCAFF_TAG_ID_PLACEHOLDER : undefined}
            placeholderTextColor="#8A8A8A"
            onFocus={() => {
              if (isLength) {
                setIsEditingScaffoldLength(true);
              } else if (isHeight) {
                setIsEditingScaffoldHeight(true);
              } else if (isDrawing) {
                setIsDrawingNumberFocused(true);
              }
            }}
            onBlur={() => {
              if (isLength) {
                setIsEditingScaffoldLength(false);
              } else if (isHeight) {
                setIsEditingScaffoldHeight(false);
              } else if (isDrawing && !showDrawingRegister) {
                setIsDrawingNumberFocused(false);
              }
            }}
            onChangeText={value => {
              if (field.key === 'scaffoldLength' || field.key === 'scaffoldIdNo' || field.key === 'baysLong' || field.key === 'scaffoldHeight' || field.key === 'workingDecks') {
                updateNumericField(field.key, value);
                return;
              }
              if (isDrawing) {
                setForm(prev => ({
                  ...prev,
                  drawingNumber: value,
                  drawingDocumentId: '',
                  drawingDocumentType: '',
                  drawingDocumentName: '',
                  drawingRevisionNumber: '',
                  drawingFolderId: '',
                }));
                return;
              }
              if (isScaffTag) {
                setForm(prev => ({...prev, scaffTagId: value, scaffTagFormId: ''}));
                return;
              }
              updateField(field.key, value);
            }}
          />
        );
      })}
      {suggestedScaffTags.length > 0 && !isReadOnly ? (
        <View
          style={[
            styles.iPhoneScaffTagDropdown,
            phoneFormBoxStyle({
              left: 201,
              top: 205.5,
              width: 540,
              height: Math.min(suggestedScaffTags.length, 4) * 38,
            }),
          ]}>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={suggestedScaffTags.length > 4}>
            {suggestedScaffTags.map((scaffTag, index) => (
              <TouchableOpacity
                key={`iphone-scaff-tag-suggestion-${scaffTag.id}`}
                activeOpacity={0.72}
                style={[
                  styles.iPhoneScaffTagSuggestion,
                  index < suggestedScaffTags.length - 1
                    ? styles.iPhoneScaffTagSuggestionDivider
                    : null,
                ]}
                onPress={() => selectScaffTag(scaffTag)}>
                <View style={styles.iPhoneScaffTagSuggestionCopy}>
                  <Text style={styles.iPhoneScaffTagSuggestionLabel}>SCAFF-TAG MATCH</Text>
                  <Text style={styles.iPhoneScaffTagSuggestionName} numberOfLines={1}>
                    {scaffTag.scaffoldNo || 'Scaff-Tag'}
                  </Text>
                </View>
                <Text style={styles.iPhoneScaffTagSuggestionReference}>
                  {scaffTag.tagNumber ? `ST-${scaffTag.tagNumber}` : ''}
                </Text>
                <Text style={styles.iPhoneScaffTagSuggestionChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {!isReadOnly && !isDrawingLinked && isDrawingNumberFocused ? (
        <TouchableOpacity
          style={[styles.iPhoneRegisterButton, phoneFormBoxStyle({left: 336, top: 331.4, width: 56, height: 18})]}
          onPressIn={handleDrawingRegisterButtonPress}>
          <Text style={styles.iPhoneRegisterButtonText}>Register</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  const renderIPhoneChoice = <T extends string>(
    choices: Array<{value: T; box: PhoneFormBox}>,
    selectedValue: T,
    onSelect: (value: T | '') => void,
    prefix: string,
  ) => choices.map(choice => {
    const active = selectedValue === choice.value;
    return (
      <TouchableOpacity
        key={`${prefix}-${choice.value}`}
        accessibilityRole="checkbox"
        accessibilityState={{checked: active, disabled: isReadOnly}}
        style={[styles.iPhoneDocumentCheckbox, phoneFormBoxStyle(choice.box)]}
        disabled={isReadOnly}
        onPress={() => onSelect(active ? '' : choice.value)}>
        {active ? <Text style={styles.iPhoneDocumentCheckboxTick}>X</Text> : null}
      </TouchableOpacity>
    );
  });

  const renderIPhoneChecklist = () => PHONE_CHECKLIST_PLACEMENTS.map(placement => (
    <View
      key={`iphone-checklist-${placement.id}`}
      style={[styles.iPhoneStatusGroup, phoneFormBoxStyle(placement)]}>
      {(['YES', 'NO', 'NA'] as HandoverChecklistStatus[]).map(value => {
        const active = form.checklist[placement.id] === value;
        return (
          <TouchableOpacity
            key={`iphone-checklist-${placement.id}-${value}`}
            accessibilityRole="checkbox"
            accessibilityLabel={`${value}: ${placement.id}`}
            accessibilityState={{checked: active, disabled: isReadOnly}}
            style={[styles.iPhoneStatusCell, active ? styles.iPhoneStatusCellActive : null]}
            disabled={isReadOnly}
            onPress={() => updateChecklist(placement.id, value)}>
            <Text style={styles.iPhoneStatusCellText}>
              {value === 'NA' ? 'N/A' : value.charAt(0) + value.slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  ));

  const renderIPhoneDutyLabels = () => PHONE_DUTY_LABELS.map(({label, box}) => (
    <View
      key={`iphone-duty-label-${label}`}
      pointerEvents="none"
      style={[styles.iPhoneDutyLabelPatch, phoneFormBoxStyle(box)]}>
      <Text
        style={styles.iPhoneDutyLabelText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.9}
        allowFontScaling={false}>
        {label}
      </Text>
    </View>
  ));

  const renderIPhoneChecklistLabels = () => PHONE_CHECKLIST_PLACEMENTS.map(placement => {
    const isLeftColumn = placement.left === 322;
    return (
      <View
        key={`iphone-checklist-label-${placement.id}`}
        pointerEvents="none"
        style={[
          styles.iPhoneChecklistLabelCell,
          phoneFormBoxStyle({
            left: isLeftColumn ? 64 : 402,
            top: placement.top,
            width: isLeftColumn ? 258 : 264,
            height: placement.height,
          }),
        ]}>
        <Text
          style={[styles.iPhoneDetailsTableLabel, styles.iPhoneChecklistLabelText]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.72}>
          {PHONE_CHECKLIST_LABELS[placement.id]}
        </Text>
      </View>
    );
  });

  const renderIPhoneCorrectiveActions = () => form.correctiveActions.slice(0, 4).map((row, index) => {
    const top = PHONE_ACTION_ROWS[index];
    const rowHeight = PHONE_ACTION_ROWS[index + 1] - top;
    return (
      <React.Fragment key={`iphone-action-${index}`}>
        <TextInput
          style={[styles.iPhoneActionInput, phoneFormBoxStyle({left: 64, top, width: 338, height: rowHeight})]}
          accessibilityLabel={`Corrective action ${index + 1}`}
          editable={!isReadOnly}
          multiline
          value={row.actionRequired}
          onChangeText={value => updateActionRow(index, 'actionRequired', value)}
        />
        <TextInput
          style={[styles.iPhoneActionInput, phoneFormBoxStyle({left: 402, top, width: 264, height: rowHeight})]}
          accessibilityLabel={`Completed by for corrective action ${index + 1}`}
          editable={!isReadOnly}
          value={row.completedBy}
          onChangeText={value => updateActionRow(index, 'completedBy', value)}
        />
        <TextInput
          style={[styles.iPhoneActionInput, phoneFormBoxStyle({left: 666, top, width: 80, height: rowHeight})]}
          accessibilityLabel={`Date for corrective action ${index + 1}`}
          editable={!isReadOnly}
          value={row.date}
          onChangeText={value => updateActionRow(index, 'date', value)}
        />
      </React.Fragment>
    );
  });

  const renderIPhonePhotos = () => PHONE_PHOTO_BOXES.map((box, slot) => {
    const photo = getPhotoForSlot(slot);
    return (
      <TouchableOpacity
        key={`iphone-document-photo-${slot}`}
        accessibilityRole="button"
        accessibilityLabel={`${photo ? 'Replace' : 'Add'} photo ${slot + 1}`}
        style={[styles.iPhonePhotoCell, phoneFormBoxStyle(box)]}
        activeOpacity={isReadOnly ? 1 : 0.82}
        disabled={isReadOnly}
        onPress={() => pickPhoto(slot)}>
        {photo ? (
          <Image source={photo} style={styles.iPhonePhotoImage} resizeMode="cover" />
        ) : (
          <Text style={styles.iPhonePhotoPrompt}>+ PHOTO</Text>
        )}
      </TouchableOpacity>
    );
  });

  const renderIPhoneSignature = (
    target: SignatureTarget,
    box: PhoneFormBox,
    strokes: SignatureStroke[],
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${target === 'ess' ? representativeLabel : 'Client'} signature`}
      style={[styles.iPhoneSignatureBox, phoneFormBoxStyle(box)]}
      activeOpacity={isReadOnly ? 1 : 0.82}
      disabled={isReadOnly}
      onPress={() => openSignatureModal(target)}>
      {strokes.length > 0
        ? renderSignatureStrokes(strokes, box.width, box.height)
        : <Text style={styles.iPhoneSignaturePrompt}>Tap to sign</Text>}
    </TouchableOpacity>
  );

  const renderIPhonePage = (
    pageNumber: 1 | 2,
    pageHeight: number,
    source: number,
    overlays: React.ReactNode,
  ) => {
    const pageFitWidth = Math.max(1, phonePageViewportWidth - 32);
    const pageSlotContentHeight = Math.max(180, phonePageVisibleHeight - 24);
    const pageFitScale = Math.min(
      pageFitWidth / PHONE_FORM_PAGE_WIDTH,
      pageSlotContentHeight / pageHeight,
    );
    const fittedCanvasStyle = phonePageFittedCanvasStyle(pageHeight, pageFitScale);
    const viewportStyle = {
      width: phonePageViewportWidth,
      height: phonePageVisibleHeight,
    };
    const sourcePageHeight = pageNumber === 2
      ? PHONE_FORM_PAGE_TWO_SOURCE_HEIGHT
      : PHONE_FORM_PAGE_ONE_SOURCE_HEIGHT;
    const pageTopCrop = pageNumber === 2
      ? PHONE_FORM_PAGE_TWO_TOP_CROP
      : PHONE_FORM_PAGE_ONE_TOP_CROP;
    return (
      <ScrollView
        key={`iphone-page-${pageNumber}-${phonePageViewportWidth}`}
        testID={`ess-handover-stable-scroll-page-${pageNumber}`}
        style={[
          styles.iPhonePageViewport,
          viewportStyle,
        ]}
        contentContainerStyle={fittedCanvasStyle}
        horizontal
        nestedScrollEnabled
        centerContent
        bounces={false}
        bouncesZoom
        alwaysBounceHorizontal={false}
        alwaysBounceVertical={false}
        minimumZoomScale={1}
        maximumZoomScale={6}
        zoomScale={1}
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}>
          <View style={[styles.iPhonePageFitCanvas, fittedCanvasStyle]}>
            <View style={[styles.iPhonePageCanvas, phonePageScaledCanvasStyle(pageHeight, pageFitScale)]}>
              <View
                style={[
                  styles.iPhonePageSource,
                  {
                    left: -PHONE_FORM_PAGE_LEFT_CROP,
                    top: -pageTopCrop,
                    height: sourcePageHeight,
                  },
                ]}>
                <Image
                  source={source}
                  style={[styles.iPhonePageImage, phonePageImageStyle(sourcePageHeight)]}
                  resizeMode="stretch"
                />
                {overlays}
              </View>
            </View>
          </View>
      </ScrollView>
    );
  };

  const renderIPhoneDocumentForm = () => (
    <View style={styles.iPhoneDocumentForm}>
      <View style={[styles.iPhonePageSlot, {height: phonePageAvailableHeight}]}>
        {renderIPhonePage(
          1,
          PHONE_FORM_PAGE_ONE_HEIGHT,
          company.id === 'maloo'
            ? {uri: '/scaffold-forms/phone-page-1-maloo.png'}
            : {uri: '/scaffold-forms/phone-page-1.png'},
          <>
            <View
              pointerEvents="none"
              style={[
                styles.iPhoneInspectionLabelPatch,
                phoneFormBoxStyle({left: 590, top: 102.5, width: 91, height: 19}),
              ]}>
              <Text style={styles.iPhoneInspectionLabelPatchText}>INSPECTION NO.</Text>
            </View>
            {renderIPhoneDetailsTable()}
            {renderIPhoneDetailInputs()}
            {renderIPhoneChoice(
              PHONE_ACCESS_CHOICES,
              form.accessType,
              value => updateField('accessType', value),
              'iphone-access',
            )}
            {renderIPhoneChoice(
              PHONE_DUTY_CHOICES,
              form.scaffoldDuty,
              value => updateField('scaffoldDuty', value),
              'iphone-duty',
            )}
            {renderIPhoneDutyLabels()}
            {renderIPhoneChecklistLabels()}
            {renderIPhoneChecklist()}
            {!isReadOnly ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Mark every checklist item as Yes"
                activeOpacity={0.78}
                hitSlop={8}
                style={[
                  styles.iPhoneYesToAllButton,
                  phoneFormBoxStyle({left: 669, top: 447, width: 69, height: 15}),
                ]}
                onPress={markAllChecklistYes}>
                <Text style={styles.iPhoneYesToAllButtonText}>YES TO ALL</Text>
              </TouchableOpacity>
            ) : null}
            <View
              pointerEvents="none"
              style={[
                styles.iPhoneChecklistOutline,
                phoneFormBoxStyle({left: 64, top: 444.5, width: 682, height: 429}),
              ]}
            />
            {renderIPhoneCorrectiveActions()}
          </>,
        )}
      </View>
      <View style={[styles.iPhonePageSlot, {height: phonePageAvailableHeight}]}>
        {renderIPhonePage(
          2,
          PHONE_FORM_PAGE_TWO_HEIGHT,
          company.id === 'maloo'
            ? {uri: '/scaffold-forms/phone-page-2-maloo.png'}
            : {uri: '/scaffold-forms/phone-page-2.png'},
          <>
            {renderIPhonePhotos()}
            <View
              pointerEvents="none"
              style={[
                styles.iPhonePhotoTableOutline,
                phoneFormBoxStyle({left: 65, top: 159.5, width: 679, height: 473}),
              ]}
            />
            <TextInput
              style={[styles.iPhoneCommentsInput, phoneFormBoxStyle({left: 65, top: 676.5, width: 680, height: 189.5})]}
              accessibilityLabel="Comments, alterations and details"
              editable={!isReadOnly}
              multiline
              value={form.comments}
              onChangeText={value => updateField('comments', value)}
            />
            <TextInput
              style={[styles.iPhoneNameInput, phoneFormBoxStyle({left: 198, top: 884, width: 216, height: 20})]}
              accessibilityLabel={`${representativeLabel} name`}
              editable={!isReadOnly}
              value={form.essRepresentativeName}
              onChangeText={value => updateField('essRepresentativeName', value)}
            />
            <TextInput
              style={[styles.iPhoneNameInput, phoneFormBoxStyle({left: 514, top: 886, width: 193, height: 20})]}
              accessibilityLabel="Client name"
              editable={!isReadOnly}
              value={form.clientName}
              onChangeText={value => updateField('clientName', value)}
            />
            {renderIPhoneSignature(
              'ess',
              {left: 227.5, top: 923, width: 186.5, height: 52},
              form.essRepresentativeSignatureStrokes,
            )}
            {renderIPhoneSignature(
              'client',
              {left: 523, top: 921, width: 186.5, height: 52},
              form.clientSignatureStrokes,
            )}
          </>,
        )}
      </View>
    </View>
  );

  const renderPhoneInput = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    options?: {
      multiline?: boolean;
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
      editable?: boolean;
      displayValue?: string;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ) => (
    <View style={styles.phoneField}>
      <Text style={styles.phoneFieldLabel}>{label}</Text>
      <TextInput
        style={[styles.phoneInput, options?.multiline ? styles.phoneInputMultiline : null]}
        editable={(options?.editable ?? true) && !isReadOnly}
        selectTextOnFocus
        multiline={options?.multiline}
        keyboardType={options?.keyboardType ?? 'default'}
        value={options?.displayValue ?? value}
        onFocus={options?.onFocus}
        onBlur={options?.onBlur}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={theme.textSecondary}
      />
    </View>
  );

  const renderPhoneSection = (title: string, content: React.ReactNode) => (
    <View style={styles.phoneSection}>
      <View style={styles.phoneSectionHeader}>
        <Text style={styles.phoneSectionTitle}>{title}</Text>
      </View>
      <View style={styles.phoneSectionBody}>{content}</View>
    </View>
  );

  const renderPhoneReferenceNameField = () => (
    <View style={[styles.phoneField, styles.phoneReferenceField]}>
      <Text style={styles.phoneFieldLabel}>Form Reference Name</Text>
      <View style={styles.phoneDrawingInputWrap}>
        <TextInput
          style={styles.phoneDrawingInput}
          editable={!isReadOnly}
          selectTextOnFocus
          value={form.formReferenceName}
          onChangeText={value => updateField('formReferenceName', value)}
          placeholder="Form Reference Name"
          placeholderTextColor={theme.textSecondary}
        />
        {!isReadOnly ? (
          <TouchableOpacity
            style={styles.phoneRegisterButton}
            onPress={() => setShowScaffTagPicker(true)}>
            <Text style={styles.phoneRegisterButtonText}>Search register</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {renderInlineScaffTagSuggestion(styles.phoneScaffTagDropdownPosition)}
    </View>
  );

  const renderPhoneDrawingField = () => (
    <View style={styles.phoneField}>
      <Text style={styles.phoneFieldLabel}>Drawing Number</Text>
      <View style={styles.phoneDrawingInputWrap}>
        {form.drawingDocumentId && form.drawingNumber && !isDrawingNumberFocused ? (
          <Pressable
            style={styles.phoneDrawingLinkedInput}
            onPress={() => {
              setIsDrawingNumberFocused(true);
              requestAnimationFrame(() => drawingNumberInputRef.current?.focus());
            }}>
            <TouchableOpacity style={styles.phoneDrawingLinkTapArea} onPress={openLinkedDrawingDocument}>
              <Text style={styles.drawingNumberLinkText} numberOfLines={1}>
                {form.drawingNumber}
                {form.drawingRevisionNumber ? ` · Rev ${form.drawingRevisionNumber}` : ''}
              </Text>
            </TouchableOpacity>
            <TextInput
              ref={drawingNumberInputRef}
              style={styles.drawingNumberHiddenInput}
              editable={!isReadOnly}
              value={form.drawingNumber}
              onFocus={() => setIsDrawingNumberFocused(true)}
              onChangeText={value => setForm(prev => ({
                ...prev,
                drawingNumber: value,
                drawingDocumentId: '',
                drawingDocumentType: '',
                drawingDocumentName: '',
                drawingRevisionNumber: '',
                drawingFolderId: '',
              }))}
            />
          </Pressable>
        ) : (
          <TextInput
            ref={drawingNumberInputRef}
            style={styles.phoneDrawingInput}
            editable={!isReadOnly}
            selectTextOnFocus
            value={form.drawingNumber}
            onFocus={() => setIsDrawingNumberFocused(true)}
            onBlur={() => {
              if (!showDrawingRegister) {
                setIsDrawingNumberFocused(false);
              }
            }}
            onChangeText={value => setForm(prev => ({
              ...prev,
              drawingNumber: value,
              drawingDocumentId: '',
              drawingDocumentType: '',
              drawingDocumentName: '',
              drawingRevisionNumber: '',
              drawingFolderId: '',
            }))}
            placeholder="Drawing Number"
            placeholderTextColor={theme.textSecondary}
          />
        )}
        {!isReadOnly && isDrawingNumberFocused ? (
          <TouchableOpacity
            style={styles.phoneRegisterButton}
            onPressIn={handleDrawingRegisterButtonPress}>
            <Text style={styles.phoneRegisterButtonText}>Register</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderPhoneScaffTagField = () => (
    <View style={styles.phoneField}>
      <Text style={styles.phoneFieldLabel}>Scaff-Tag ID</Text>
      <View style={styles.phoneDrawingInputWrap}>
        {form.scaffTagFormId && form.scaffTagId ? (
          <View style={styles.phoneLinkedReferenceEditRow}>
            <TouchableOpacity
              style={styles.phoneLinkedReferenceButton}
              activeOpacity={0.75}
              accessibilityRole="link"
              accessibilityLabel="Open linked Scaff-Tag"
              onPress={openLinkedScaffTag}>
              <Text style={styles.phoneLinkedReferenceText} numberOfLines={1}>
                {form.scaffTagId}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TextInput
            style={styles.phoneDrawingInput}
            editable={false}
            selectTextOnFocus={false}
            value={form.scaffTagId}
            placeholder={EMPTY_SCAFF_TAG_ID_PLACEHOLDER}
            placeholderTextColor="#8A8A8A"
          />
        )}
      </View>
    </View>
  );

  const renderPhoneChoiceGroup = <T extends string>(
    value: T,
    choices: Array<[T, string]>,
    onSelect: (nextValue: T | '') => void,
  ) => (
    <View style={styles.phoneChoiceGrid}>
      {choices.map(([choiceValue, label]) => {
        const active = value === choiceValue;
        return (
          <TouchableOpacity
            key={choiceValue}
            style={[styles.phoneChoice, active ? styles.phoneChoiceActive : null]}
            disabled={isReadOnly}
            onPress={() => onSelect(active ? '' : choiceValue)}>
            <View style={[styles.phoneCheckbox, active ? styles.phoneCheckboxActive : null]}>
              {active ? <Text style={styles.phoneCheckboxTick}>X</Text> : null}
            </View>
            <Text style={[styles.phoneChoiceText, active ? styles.phoneChoiceTextActive : null]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderPhoneChecklistSection = (title: string, items: ChecklistItem[]) => (
    <View style={styles.phoneChecklistSection}>
      <Text style={styles.phoneChecklistTitle}>{title}</Text>
      {items.map(item => (
        <View key={`phone-${title}-${item.id}`} style={styles.phoneChecklistItem}>
          <Text style={styles.phoneChecklistQuestion}>{item.label}</Text>
          <View style={styles.phoneStatusGroup}>
            {(['YES', 'NO', 'NA'] as HandoverChecklistStatus[]).map(value => {
              const active = form.checklist[item.id] === value;
              return (
                <TouchableOpacity
                  key={`phone-${item.id}-${value}`}
                  style={[styles.phoneStatusPill, active ? styles.phoneStatusPillActive : null]}
                  disabled={isReadOnly}
                  onPress={() => updateChecklist(item.id, value)}>
                  <Text style={[styles.phoneStatusPillText, active ? styles.phoneStatusPillTextActive : null]}>{value}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );

  const renderPhoneForm = () => (
    <>
      <View style={styles.phoneHero}>
        <View style={styles.phoneHeroTop}>
          <Image source={company.logo} style={styles.phoneLogo} resizeMode="contain" />
          <View style={styles.phoneInspectionBadge}>
            <Text style={styles.phoneInspectionLabel}>Inspection No.</Text>
            <Text style={styles.phoneInspectionValue}>{form.inspectionNumber || inspectionNumberPreview}</Text>
          </View>
        </View>
      </View>

      {renderPhoneSection('Details', (
        <>
          {DETAILS_FIELDS.map(field => (
            <React.Fragment key={`phone-detail-${field.key}`}>
              {field.key === 'formReferenceName'
                ? renderPhoneReferenceNameField()
                : renderPhoneInput(
                    field.label,
                    form[field.key],
                    value => updateField(field.key, value),
                    {multiline: field.multiline, editable: field.key !== 'inspectionDateTime'},
                  )}
            </React.Fragment>
          ))}
          {renderPhoneInput('Intended use', form.intendedUse, value => updateField('intendedUse', value))}
          {renderPhoneInput(
            'No. of working decks',
            form.workingDecks,
            value => updateNumericField('workingDecks', value),
            {keyboardType: 'number-pad'},
          )}
        </>
      ))}

      {renderPhoneSection('Scaffold', (
        <>
          {renderPhoneInput('Scaffold Length', form.scaffoldLength, value => updateNumericField('scaffoldLength', value), {
            keyboardType: 'decimal-pad',
            displayValue: isEditingScaffoldLength || !form.scaffoldLength ? form.scaffoldLength : `${form.scaffoldLength}m`,
            onFocus: () => setIsEditingScaffoldLength(true),
            onBlur: () => setIsEditingScaffoldLength(false),
          })}
          {renderPhoneInput('Scaffold ID No', form.scaffoldIdNo, value => updateNumericField('scaffoldIdNo', value), {keyboardType: 'number-pad'})}
          {renderPhoneInput('No. of bays long', form.baysLong, value => updateNumericField('baysLong', value), {keyboardType: 'number-pad'})}
          {renderPhoneInput('Scaffold Height', form.scaffoldHeight, value => updateNumericField('scaffoldHeight', value), {
            keyboardType: 'decimal-pad',
            displayValue: isEditingScaffoldHeight || !form.scaffoldHeight ? form.scaffoldHeight : `${form.scaffoldHeight}m`,
            onFocus: () => setIsEditingScaffoldHeight(true),
            onBlur: () => setIsEditingScaffoldHeight(false),
          })}
          {renderPhoneDrawingField()}
          {renderPhoneScaffTagField()}
        </>
      ))}

      {renderPhoneSection('Access', renderPhoneChoiceGroup<HandoverAccessType>(
        form.accessType,
        [
          ['stretcher-stair', 'Stretcher Stair'],
          ['aluminium-access-stair', 'Aluminium stair'],
          ['ladder-access', 'Ladder access'],
        ],
        value => updateField('accessType', value),
      ))}

      {renderPhoneSection('Scaffold Duty', renderPhoneChoiceGroup<HandoverScaffoldDuty>(
        form.scaffoldDuty,
        [
          ['LIGHT', 'Light 225kg'],
          ['MEDIUM', 'Medium 450kg'],
          ['HEAVY', 'Heavy 675kg'],
        ],
        value => updateField('scaffoldDuty', value),
      ))}

      {renderPhoneChecklistSection('Scaffold Vicinity', SCAFFOLD_VICINITY)}
      {renderPhoneChecklistSection('Supporting Structures', SUPPORTING_STRUCTURES)}
      {renderPhoneChecklistSection('Scaffold Structures', SCAFFOLD_STRUCTURES)}

      {renderPhoneSection('Corrective Actions', (
        <View style={styles.phoneActionsList}>
          {form.correctiveActions.map((row, index) => (
            <View key={`phone-action-${index}`} style={styles.phoneActionCard}>
              <Text style={styles.phoneActionTitle}>Action {index + 1}</Text>
              {renderPhoneInput('Action Required', row.actionRequired, value => updateActionRow(index, 'actionRequired', value), {multiline: true})}
              {renderPhoneInput('Completed by', row.completedBy, value => updateActionRow(index, 'completedBy', value))}
              {renderPhoneInput('Date', row.date, value => updateActionRow(index, 'date', value))}
            </View>
          ))}
        </View>
      ))}

      {renderPhoneSection('Photos', (
        <View style={styles.phonePhotosGrid}>
          {PHOTO_SLOTS.map(slot => {
            const photo = getPhotoForSlot(slot);
            return (
              <TouchableOpacity
                key={`phone-photo-${slot}`}
                style={styles.phonePhotoSlot}
                activeOpacity={isReadOnly ? 1 : 0.85}
                disabled={isReadOnly}
                onPress={() => pickPhoto(slot)}>
                {photo ? (
                  <Image source={photo} style={styles.photoImage} resizeMode="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.phonePhotoText}>Photo {slot + 1}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {renderPhoneSection('Comments', (
        <TextInput
          style={styles.phoneCommentsInput}
          editable={!isReadOnly}
          selectTextOnFocus
          multiline
          value={form.comments}
          onChangeText={value => updateField('comments', value)}
          placeholder="Comments / Alterations / Details"
          placeholderTextColor={theme.textSecondary}
        />
      ))}

      {renderPhoneSection('Signatures', (
        <View style={styles.phoneSignatureStack}>
          {renderSignatureBoxWithStyles(
            styles,
            'ess',
            representativeLabel,
            form.essRepresentativeName,
            form.essRepresentativeSignatureStrokes,
            value => updateField('essRepresentativeName', value),
          )}
          {renderSignatureBoxWithStyles(
            styles,
            'client',
            'CLIENT',
            form.clientName,
            form.clientSignatureStrokes,
            value => updateField('clientName', value),
          )}
        </View>
      ))}

      {renderPhoneSection('Licence', renderPhoneInput(
        'HRW Licence Number',
        form.hrwLicenceNumber,
        value => updateField('hrwLicenceNumber', value),
      ))}

      {hasUnsavedChanges ? (
        <View style={styles.formPageSaveArea}>
          <TouchableOpacity style={styles.saveButton} disabled={saving} onPress={handleSave}>
            {saving ? <ActivityIndicator size="small" color="#111827" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  const initials = (user?.fullName?.trim()?.[0] ?? 'U').toUpperCase();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, styles.centered]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={prefs.themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />

      <View style={{paddingTop: insets.top, backgroundColor: theme.card}}>
        <AppTopBar
          theme={theme}
          isDarkMode={prefs.themeMode === 'dark'}
          showMenu={false}
          onPressMenu={() => setShowDrawer(true)}
          onPressBack={() => navigation.goBack()}
          centerContent={
            <CompanyEntitySelector
              entityId={form.companyEntityId}
              formName="Handover Certificate"
              theme={theme}
              disabled={isReadOnly}
              onChange={entityId => {
                companySelectionTouchedRef.current = true;
                setForm(previous => ({...previous, companyEntityId: entityId}));
              }}
            />
          }
          rightContent={
            usesIOSDocumentEditor ? (
              hasUnsavedChanges ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Save handover certificate"
                  activeOpacity={0.86}
                  style={styles.iPhoneHeaderSaveButton}
                  disabled={saving}
                  onPress={handleSave}>
                  {saving
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.iPhoneHeaderSaveText}>Save</Text>}
                </TouchableOpacity>
              ) : formId ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Share handover certificate"
                  activeOpacity={0.86}
                  style={styles.iPhoneHeaderShareButton}
                  disabled={openingShare}
                  onPress={handleShare}>
                  {openingShare
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Text style={styles.iPhoneHeaderShareText}>Share</Text>}
                </TouchableOpacity>
              ) : null
            ) : (
              <TouchableOpacity style={styles.userAvatarButton} onPress={() => setShowDrawer(true)}>
                {user?.profileImageUrl ? (
                  <Image source={{uri: user.profileImageUrl}} style={styles.userAvatarImage} />
                ) : (
                  <View style={styles.userAvatarFallback}>
                    <Text style={styles.userAvatarFallbackText}>{initials}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          }
        />
      </View>

      <ScrollView
        testID={usesIOSDocumentEditor ? 'ess-handover-stable-scroll-pager' : undefined}
        style={usesIOSDocumentEditor ? styles.iPhonePager : undefined}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        pagingEnabled={usesIOSDocumentEditor}
        decelerationRate={usesIOSDocumentEditor ? 'fast' : 'normal'}
        onLayout={event => {
          if (!usesIOSDocumentEditor) {
            return;
          }
          const {width: nextWidth, height: nextHeight} = event.nativeEvent.layout;
          if (nextWidth > 0 && Math.abs(nextWidth - documentPagerWidth) > 1) {
            setDocumentPagerWidth(nextWidth);
          }
          if (nextHeight > 0 && Math.abs(nextHeight - documentPagerHeight) > 1) {
            setDocumentPagerHeight(nextHeight);
          }
        }}
        showsVerticalScrollIndicator={!usesIOSDocumentEditor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={usesIOSDocumentEditor ? styles.iPhonePagerContent : [
          styles.scroll,
          {paddingBottom: Math.max(Spacing.xl * 2, insets.bottom + 120)},
        ]}>
        {usesIOSDocumentEditor ? renderIPhoneDocumentForm() : isWide ? (
          <>
            {renderFirstSheet(styles)}
            {renderSecondSheet(styles)}
          </>
        ) : renderPhoneForm()}

      </ScrollView>
      <SideMenuDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        theme={theme}
        onGoHome={goDesignRoot}
        onGoSafety={() => navigation.navigate('Safety')}
        onGoRostering={() => navigation.navigate('Rostering')}
        onGoMaterialOrdering={() => navigation.navigate('MaterialOrdering')}
        onGoFavorites={() => navigation.navigate('Favorites')}
        onGoNotifications={() => navigation.navigate('Notifications')}
        onGoSettings={() => navigation.navigate('Settings')}
      />

      <ScaffoldRecordLinkPickerModal
        visible={showScaffTagPicker}
        title="Search Scaff-Tag Register"
        emptyText="No Scaff-Tags have been saved in this project yet."
        items={scaffTagPickerItems}
        selectedId={form.scaffTagFormId}
        onSelect={item => {
          const scaffTag = linkableScaffTags.find(candidate => candidate.id === item.id);
          if (scaffTag) {
            selectScaffTag(scaffTag);
          }
        }}
        onClear={() => {
          setForm(previous => ({...previous, scaffTagFormId: '', scaffTagId: ''}));
          setShowScaffTagPicker(false);
        }}
        onClose={() => setShowScaffTagPicker(false)}
      />

      <ProjectDataFormShareModal
        visible={showShareModal}
        theme={theme}
        title={form.formReferenceName || form.inspectionNumber || 'Handover Certificate'}
        recipients={notificationRecipients}
        loadingRecipients={shareRecipientsLoading}
        sharing={shareSending}
        emailingAttachment={shareEmailingAttachment}
        onClose={() => {
          if (!shareSending && !shareEmailingAttachment) {
            setShowShareModal(false);
          }
        }}
        onShare={handleProjectDataShare}
        onEmailAttachment={handleProjectDataEmailAttachment}
      />

      <ProjectDataFormDemoModal
        visible={showWorkflowDemo}
        variant="handover"
        formNumber={form.inspectionNumber || inspectionNumberPreview}
        referenceName={form.formReferenceName}
        representativeName={form.essRepresentativeName}
        showDontShowAgain
        onDontShowAgain={dismissWorkflowDemoPermanently}
        onClose={() => setShowWorkflowDemo(false)}
      />

      <SignaturePadModal
        visible={showSignatureModal}
        title="Draw Signature"
        initialStrokes={signatureTarget === 'ess'
          ? form.essRepresentativeSignatureStrokes
          : form.clientSignatureStrokes}
        applyLabel="Use Signature"
        canvasHeight={240}
        onApply={applySignature}
        onClose={() => setShowSignatureModal(false)}
      />

      <Modal visible={showDrawingRegister} transparent animationType="fade" onRequestClose={() => {
        setIsDrawingNumberFocused(false);
        setShowDrawingRegister(false);
      }}>
        <Pressable style={styles.modalOverlay} onPress={() => {
          setIsDrawingNumberFocused(false);
          setShowDrawingRegister(false);
        }}>
          <Pressable style={styles.drawingRegisterCard}>
            <Text style={styles.signatureModalTitle} numberOfLines={2}>
              {drawingRegisterProjectScoped ? `${route.params.projectName} Designs` : 'ESS Design Register'}
            </Text>
            {isWide ? (
              <View style={styles.drawingBreadcrumbRow}>
                <TouchableOpacity
                  style={styles.drawingBreadcrumbButton}
                  disabled={drawingRegisterLoading}
                  onPress={() => loadDrawingRegisterRoot().catch(() => {
                    // State is handled in loadDrawingRegisterRoot.
                  })}>
                  <Text style={styles.drawingBreadcrumbText}>
                    {drawingRegisterProjectScoped ? 'Project' : 'Root'}
                  </Text>
                </TouchableOpacity>
                {drawingBreadcrumbs.map(crumb => (
                  <TouchableOpacity
                    key={crumb.id}
                    style={styles.drawingBreadcrumbButton}
                    disabled={drawingRegisterLoading}
                    onPress={() => openDrawingFolder(crumb.id).catch(() => {
                      // State is handled in openDrawingFolder.
                    })}>
                    <Text style={styles.drawingBreadcrumbText} numberOfLines={1}>{crumb.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {drawingRegisterError ? <Text style={styles.drawingRegisterMessage}>{drawingRegisterError}</Text> : null}
            {drawingRegisterLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
            <FlatList
              data={drawingBrowserItems}
              keyExtractor={item => `${item.type}-${item.data.id}`}
              keyboardShouldPersistTaps="handled"
              style={styles.drawingRegisterList}
              contentContainerStyle={drawingBrowserItems.length === 0 ? styles.drawingRegisterEmptyList : undefined}
              ListEmptyComponent={
                drawingRegisterLoading ? null : (
                  <Text style={styles.drawingRegisterEmptyText}>
                    {drawingRegisterProjectScoped
                      ? 'No designs have been added to this project yet.'
                      : 'No folders or PDFs in this location.'}
                  </Text>
                )
              }
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.drawingRegisterItem}
                  onPress={() => {
                    if (item.type === 'folder') {
                      handleDrawingFolderPress(item.data).catch(() => {
                        // State is handled in handleDrawingFolderPress.
                      });
                    } else {
                      selectDrawingRegisterDocument(item.data);
                    }
                  }}>
                  <Text style={styles.drawingRegisterItemTitle} numberOfLines={1}>
                    {item.type === 'folder' ? item.data.name : getDocumentDisplayName(item.data)}
                  </Text>
                  <Text style={styles.drawingRegisterItemPath} numberOfLines={2}>
                    {item.type === 'folder'
                      ? (item.data.subFolders.some(folder => isScaffoldRevisionsFolder(folder.name)) ? 'Scaffold - latest revision will be selected' : 'Folder')
                      : `PDF document - Revision ${item.data.revisionNumber}`}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof getTheme>, isWide: boolean) {
  return StyleSheet.create({
    screen: {flex: 1, backgroundColor: theme.background},
    loadingContainer: {flex: 1, backgroundColor: theme.background},
    centered: {alignItems: 'center', justifyContent: 'center'},
    scroll: {
      padding: isWide ? Spacing.md : 12,
      gap: isWide ? Spacing.md : 10,
      paddingBottom: Spacing.xl,
    },
    iPhoneDocumentForm: {},
    iPhonePager: {
      flex: 1,
      backgroundColor: '#FFFFFF',
    },
    iPhonePagerContent: {
      flexGrow: 1,
      padding: 0,
      backgroundColor: '#FFFFFF',
    },
    iPhonePageSlot: {
      alignItems: 'center',
      justifyContent: 'flex-start',
      backgroundColor: '#FFFFFF',
    },
    iPhonePageViewport: {
      flexGrow: 0,
      flexShrink: 0,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    iPhonePageFitCanvas: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#D1D5DB',
      shadowColor: '#111827',
      shadowOpacity: 0.12,
      shadowRadius: 3,
      shadowOffset: {width: 0, height: 1},
    },
    iPhonePageCanvas: {
      position: 'relative',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
    },
    iPhonePageSource: {
      position: 'absolute',
      width: PHONE_FORM_PAGE_SOURCE_WIDTH,
    },
    iPhonePageImage: {
      position: 'absolute',
      left: 0,
      top: 0,
    },
    iPhoneDocumentInput: {
      zIndex: 2,
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: '#111111',
      fontSize: 9,
      lineHeight: 11,
      paddingHorizontal: 4,
      paddingVertical: 0,
      includeFontPadding: false,
    },
    iPhoneLockedFieldText: {
      color: '#6B7280',
    },
    iPhoneLinkedReferenceRow: {
      zIndex: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 4,
      backgroundColor: 'transparent',
    },
    iPhoneLinkedReferenceButton: {
      maxWidth: '72%',
      height: 18,
      justifyContent: 'center',
      flexShrink: 0,
    },
    iPhoneLinkedReferenceText: {
      color: Colors.primary,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '700',
      textDecorationLine: 'underline',
      includeFontPadding: false,
    },
    iPhoneLinkedReferenceEditInput: {
      flex: 1,
      minWidth: 0,
      height: 18,
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: '#111111',
      fontSize: 7,
      lineHeight: 9,
      paddingHorizontal: 0,
      paddingVertical: 0,
      includeFontPadding: false,
    },
    iPhoneDetailsTablePatch: {
      zIndex: 1,
      backgroundColor: '#FFFFFF',
    },
    iPhoneDetailsTableGrid: {
      width: 680,
      marginLeft: 1,
      marginTop: 1,
    },
    iPhoneDetailsTableHeader: {
      height: 23.3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F28C28',
      borderWidth: 1,
      borderRightWidth: 0.5,
      borderColor: '#333333',
    },
    iPhoneDetailsTableHeaderText: {
      color: '#222222',
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '800',
    },
    iPhoneDetailsFullRow: {
      height: 21.8,
      flexDirection: 'row',
      borderLeftWidth: 1,
      borderLeftColor: '#333333',
      borderRightWidth: 0.5,
      borderRightColor: '#333333',
      borderBottomWidth: 1,
      borderBottomColor: '#C6C6C6',
    },
    iPhoneDetailsPairedRow: {
      height: 19.4,
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#C6C6C6',
      borderLeftWidth: 1,
      borderLeftColor: '#333333',
      borderRightWidth: 0.5,
      borderRightColor: '#333333',
    },
    iPhoneDetailsLeadPairedRow: {
      height: 22,
    },
    iPhoneDetailsFullLabelCell: {
      width: 137,
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingRight: 5,
      backgroundColor: '#EEEEEE',
      borderRightWidth: 1,
      borderRightColor: '#C6C6C6',
    },
    iPhoneDetailsFullValueCell: {flex: 1},
    iPhoneDetailsLeftLabelCell: {
      width: 137,
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingRight: 5,
      backgroundColor: '#EEEEEE',
      borderRightWidth: 1,
      borderRightColor: '#C6C6C6',
    },
    iPhoneDetailsLeftValueCell: {
      width: 193,
      borderRightWidth: 1,
      borderRightColor: '#C6C6C6',
    },
    iPhoneDetailsRightLabelCell: {
      width: 160,
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingRight: 5,
      backgroundColor: '#EEEEEE',
      borderRightWidth: 1,
      borderRightColor: '#C6C6C6',
    },
    iPhoneDetailsRightValueCell: {flex: 1},
    iPhoneDetailsTableLabel: {
      color: '#111111',
      fontSize: 9,
      lineHeight: 11,
    },
    iPhoneDetailsReferenceLabel: {
      fontWeight: '700',
      fontStyle: 'italic',
    },
    iPhoneInspectionInput: {
      fontSize: 8.5,
      lineHeight: 10,
      fontWeight: '700',
      textAlign: 'center',
      paddingHorizontal: 1,
    },
    iPhoneInspectionLabelPatch: {
      zIndex: 1,
      backgroundColor: '#FFFFFF',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 4.5,
    },
    iPhoneInspectionLabelPatchText: {
      color: '#F04438',
      fontSize: 9.4,
      lineHeight: 11,
      fontWeight: '800',
      includeFontPadding: false,
    },
    iPhoneRegisterButton: {
      zIndex: 5,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 2,
      backgroundColor: '#FFFFFF',
    },
    iPhoneRegisterButtonText: {color: '#111827', fontSize: 7, fontWeight: '800'},
    iPhoneReferenceRegisterButton: {
      zIndex: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 2,
      backgroundColor: '#F3F4F6',
    },
    iPhoneReferenceRegisterButtonText: {
      color: '#111827',
      fontSize: 6.5,
      fontWeight: '900',
    },
    iPhoneScaffTagDropdown: {
      zIndex: 50,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: 5,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      shadowColor: '#0F172A',
      shadowOpacity: 0.14,
      shadowRadius: 3,
      shadowOffset: {width: 0, height: 2},
      elevation: 5,
    },
    iPhoneScaffTagSuggestion: {
      height: 38,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 8,
      paddingRight: 4,
    },
    iPhoneScaffTagSuggestionDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#E5E7EB',
    },
    iPhoneScaffTagSuggestionCopy: {flex: 1, minWidth: 0},
    iPhoneScaffTagSuggestionLabel: {
      color: '#6B7280',
      fontSize: 6.5,
      lineHeight: 8,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    iPhoneScaffTagSuggestionName: {
      color: '#111827',
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '900',
    },
    iPhoneScaffTagSuggestionReference: {
      color: '#4B5563',
      fontSize: 7.5,
      fontWeight: '900',
      marginHorizontal: 7,
    },
    iPhoneScaffTagSuggestionChevron: {
      color: '#9CA3AF',
      fontSize: 18,
      lineHeight: 20,
      fontWeight: '500',
      marginLeft: 2,
      marginRight: 5,
    },
    iPhoneDocumentCheckbox: {
      zIndex: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    iPhoneDocumentCheckboxTick: {
      color: '#111111',
      fontSize: 17,
      lineHeight: 19,
      fontWeight: '900',
      textAlign: 'center',
    },
    iPhoneDutyLabelPatch: {
      zIndex: 2,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 2,
      backgroundColor: '#FFFFFF',
    },
    iPhoneDutyLabelText: {
      width: '100%',
      color: '#111111',
      fontFamily: 'Arial',
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '400',
      textAlign: 'right',
    },
    iPhoneStatusGroup: {zIndex: 3, flexDirection: 'row'},
    iPhoneStatusCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F7F7F7',
      borderLeftWidth: 1,
      borderLeftColor: '#C6C6C6',
      borderBottomWidth: 1,
      borderBottomColor: '#C6C6C6',
    },
    iPhoneStatusCellText: {
      color: '#6B7280',
      fontSize: 9,
      lineHeight: 11,
    },
    iPhoneStatusCellActive: {
      backgroundColor: 'rgba(75, 85, 99, 0.28)',
    },
    iPhoneYesToAllButton: {
      zIndex: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0.75,
      borderColor: '#6B3A00',
      borderRadius: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.90)',
    },
    iPhoneYesToAllButtonText: {
      color: '#3F270F',
      fontSize: 7,
      lineHeight: 9,
      fontWeight: '800',
      letterSpacing: 0.1,
    },
    iPhoneChecklistOutline: {
      zIndex: 4,
      borderWidth: 1,
      borderRightWidth: 0.5,
      borderColor: '#333333',
      backgroundColor: 'transparent',
    },
    iPhoneChecklistLabelCell: {
      zIndex: 2,
      justifyContent: 'center',
      backgroundColor: '#EEEEEE',
      borderRightWidth: 1,
      borderRightColor: '#C6C6C6',
      borderBottomWidth: 1,
      borderBottomColor: '#C6C6C6',
      paddingHorizontal: 3,
    },
    iPhoneChecklistLabelText: {
      textAlign: 'left',
    },
    iPhoneActionInput: {
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: '#111111',
      fontSize: 7,
      lineHeight: 9,
      paddingHorizontal: 4,
      paddingVertical: 2,
      textAlignVertical: 'top',
      includeFontPadding: false,
    },
    iPhonePhotoCell: {
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: 'transparent',
    },
    iPhonePhotoImage: {width: '100%', height: '100%'},
    iPhonePhotoPrompt: {color: '#9CA3AF', fontSize: 12, fontWeight: '800', letterSpacing: 0.5},
    iPhonePhotoTableOutline: {
      zIndex: 4,
      borderWidth: 1,
      borderTopWidth: 0,
      borderRightWidth: 0.5,
      borderColor: '#333333',
      backgroundColor: 'transparent',
    },
    iPhoneCommentsInput: {
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: '#111111',
      fontSize: 10,
      lineHeight: 13,
      paddingHorizontal: 6,
      paddingVertical: 5,
      textAlignVertical: 'top',
      includeFontPadding: false,
    },
    iPhoneNameInput: {
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: '#111111',
      fontSize: 9,
      lineHeight: 11,
      paddingHorizontal: 3,
      paddingVertical: 0,
      includeFontPadding: false,
    },
    iPhoneSignatureBox: {
      zIndex: 3,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: 'transparent',
    },
    iPhoneSignaturePrompt: {color: '#9CA3AF', fontSize: 8, fontWeight: '700'},
    iPhoneHeaderSaveButton: {
      minWidth: 56,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      paddingHorizontal: 13,
    },
    iPhoneHeaderSaveText: {color: '#FFFFFF', fontSize: 13, fontWeight: '700'},
    iPhoneHeaderShareButton: {
      minWidth: 60,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#C9DBF7',
      backgroundColor: '#F3F7FD',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 13,
    },
    iPhoneHeaderShareText: {color: Colors.primary, fontSize: 13, fontWeight: '700'},
    phoneHero: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: BorderRadius.md,
      padding: 12,
      gap: 8,
    },
    phoneHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    phoneLogo: {
      width: 122,
      height: 44,
      marginLeft: -8,
    },
    phoneInspectionBadge: {
      minWidth: 118,
      borderWidth: 1,
      borderColor: '#F04438',
      backgroundColor: '#F3F4F6',
      paddingHorizontal: 8,
      paddingVertical: 6,
      alignItems: 'center',
    },
    phoneInspectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: '#E4570F',
      textTransform: 'uppercase',
    },
    phoneInspectionValue: {
      fontSize: 15,
      fontWeight: '800',
      color: '#111111',
      marginTop: 2,
    },
    phoneSection: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
    },
    phoneSectionHeader: {
      backgroundColor: '#F3F4F6',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    phoneSectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#111111',
      textTransform: 'uppercase',
    },
    phoneSectionBody: {
      padding: 12,
      gap: 10,
    },
    phoneField: {
      gap: 6,
    },
    phoneReferenceField: {
      position: 'relative',
      zIndex: 100,
    },
    phoneScaffTagDropdownPosition: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 70,
      zIndex: 120,
    },
    phoneFieldLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: '#374151',
    },
    phoneInput: {
      minHeight: 42,
      borderWidth: 1,
      borderColor: '#6B7280',
      borderRadius: BorderRadius.sm,
      backgroundColor: '#FFFFFF',
      color: '#111111',
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
    },
    phoneInputMultiline: {
      minHeight: 76,
      textAlignVertical: 'top',
    },
    phoneDrawingInputWrap: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    phoneDrawingInput: {
      flex: 1,
      minWidth: 0,
      height: 42,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      backgroundColor: '#FFFFFF',
      color: '#111111',
      paddingHorizontal: 10,
      paddingVertical: 0,
      fontSize: 15,
    },
    phoneDrawingLinkedInput: {
      flex: 1,
      minWidth: 0,
      height: 42,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
    },
    phoneDrawingLinkTapArea: {
      maxWidth: '82%',
      minHeight: 30,
      justifyContent: 'center',
      paddingRight: 8,
      flexShrink: 0,
    },
    phoneLinkedReferenceEditRow: {
      flex: 1,
      minWidth: 0,
      minHeight: 42,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
    },
    phoneLinkedReferenceButton: {
      flex: 1,
      minHeight: 30,
      justifyContent: 'center',
    },
    phoneLinkedReferenceText: {
      color: Colors.primary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    phoneRegisterButton: {
      height: 42,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#6B7280',
      backgroundColor: '#F9FAFB',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    phoneRegisterButtonText: {
      color: '#111111',
      fontSize: 12,
      fontWeight: '800',
    },
    phoneChoiceGrid: {
      gap: 8,
    },
    phoneChoice: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      gap: 10,
    },
    phoneChoiceActive: {
      borderColor: '#2F80ED',
      backgroundColor: '#EAF2FF',
    },
    phoneCheckbox: {
      width: 24,
      height: 24,
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 4,
      backgroundColor: '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    phoneCheckboxActive: {
      borderColor: '#2F80ED',
      backgroundColor: '#FFFFFF',
    },
    phoneCheckboxTick: {
      fontSize: 14,
      lineHeight: 16,
      fontWeight: '900',
      color: '#1D4ED8',
      textAlign: 'center',
    },
    phoneChoiceText: {
      flex: 1,
      minWidth: 0,
      color: '#111111',
      fontSize: 15,
      fontWeight: '600',
    },
    phoneChoiceTextActive: {
      color: '#1D4ED8',
    },
    phoneChecklistSection: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
    },
    phoneChecklistTitle: {
      backgroundColor: '#F28C28',
      color: '#111111',
      fontSize: 14,
      fontWeight: '900',
      textTransform: 'uppercase',
      textAlign: 'center',
      paddingVertical: 9,
      paddingHorizontal: 10,
    },
    phoneChecklistItem: {
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
      padding: 10,
      gap: 8,
      backgroundColor: '#FFFFFF',
    },
    phoneChecklistQuestion: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      color: '#111111',
    },
    phoneStatusGroup: {
      flexDirection: 'row',
      gap: 8,
    },
    phoneStatusPill: {
      flex: 1,
      height: 36,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    phoneStatusPillActive: {
      borderColor: '#2F80ED',
      backgroundColor: '#EAF2FF',
    },
    phoneStatusPillText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#6B7280',
      textAlign: 'center',
    },
    phoneStatusPillTextActive: {
      color: '#1D4ED8',
    },
    phoneActionsList: {
      gap: 10,
    },
    phoneActionCard: {
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: BorderRadius.sm,
      padding: 10,
      gap: 10,
      backgroundColor: '#F9FAFB',
    },
    phoneActionTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#111111',
    },
    phonePhotosGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    phonePhotoSlot: {
      width: '48.7%',
      aspectRatio: 0.78,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
      backgroundColor: '#F8FAFC',
    },
    phonePhotoText: {
      color: '#6B7280',
      fontSize: 13,
      fontWeight: '700',
    },
    phoneCommentsInput: {
      minHeight: 132,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 10,
      paddingVertical: 10,
      textAlignVertical: 'top',
      color: '#111111',
      fontSize: 15,
    },
    phoneSignatureStack: {
      gap: 18,
    },
    formPageSaveArea: {
      position: 'absolute',
      right: isWide ? 24 : 12,
      bottom: isWide ? 20 : 12,
      zIndex: 10,
      alignItems: 'flex-end',
    },
    saveButton: {
      minWidth: isWide ? 170 : undefined,
      width: isWide ? undefined : 170,
      height: 42,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#6B7280',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.md,
      shadowColor: '#111827',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 3},
      elevation: 2,
    },
    saveButtonText: {color: '#111827', fontSize: FontSize.sm, fontWeight: '700'},
    sheet: {
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.md,
      padding: isWide ? 28 : 18,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      gap: 14,
      position: 'relative',
    },
    sheetHeader: {
      flexDirection: isWide ? 'row' : 'column',
      justifyContent: 'space-between',
      alignItems: isWide ? 'flex-start' : 'flex-start',
      gap: 12,
    },
    brandBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      flexShrink: 1,
      flex: 1,
      minWidth: 0,
      maxWidth: isWide ? '80%' : '100%',
    },
    brandTextWrap: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      marginLeft: isWide ? -6 : 0,
    },
    essLogo: {
      width: isWide ? 190 : 150,
      height: isWide ? 66 : 52,
      marginLeft: isWide ? -14 : -10,
    },
    brandText: {fontSize: isWide ? 13 : 12, color: '#1F2937', fontWeight: '600'},
    brandSubText: {fontSize: isWide ? 12 : 11, color: '#374151'},
    headerRight: {
      alignItems: isWide ? 'flex-end' : 'flex-start',
      justifyContent: 'center',
      alignSelf: isWide ? 'center' : 'flex-start',
      flexShrink: 0,
      marginLeft: isWide ? 12 : 0,
    },
    documentTitle: {
      maxWidth: isWide ? 330 : 250,
      marginBottom: 8,
      color: '#111111',
      fontSize: isWide ? 23 : 18,
      fontWeight: '800',
      textAlign: isWide ? 'right' : 'left',
    },
    inspectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: isWide ? 'flex-end' : 'flex-start',
    },
    inspectionLabel: {fontSize: isWide ? 15 : 14, fontWeight: '800', color: '#E4570F'},
    inspectionInput: {
      minWidth: 116,
      height: 44,
      paddingHorizontal: 10,
      borderWidth: 2,
      borderColor: '#F04438',
      color: '#111111',
      backgroundColor: '#F3F4F6',
      fontWeight: '700',
    },
    sectionBand: {
      backgroundColor: '#F28C28',
      borderWidth: 1,
      borderColor: '#1F2937',
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignItems: 'center',
    },
    sectionBandText: {fontSize: isWide ? 16 : 15, fontWeight: '800', color: '#1F2937'},
    detailsTable: {
      borderWidth: 1,
      borderColor: '#CFCFCF',
      borderTopWidth: 0,
    },
    tableRow: {
      flexDirection: isWide ? 'row' : 'column',
      borderTopWidth: 1,
      borderTopColor: '#D9D9D9',
    },
    referenceNameTableRow: {
      position: 'relative',
      zIndex: 100,
    },
    tableLabel: {
      width: isWide ? 280 : '100%',
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: '#FAFAFA',
      color: '#111111',
      fontWeight: '600',
      fontSize: FontSize.md,
    },
    tableInput: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: '#111111',
      minHeight: 48,
    },
    referenceNameInputWrap: {
      flex: 1,
      minWidth: 0,
      position: 'relative',
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 8,
    },
    referenceNameRegisterButton: {
      height: 30,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#9CA3AF',
      backgroundColor: '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    referenceNameRegisterButtonText: {
      color: '#111827',
      fontSize: 10,
      fontWeight: '900',
    },
    inlineScaffTagDropdown: {
      maxHeight: 210,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      shadowColor: '#0F172A',
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: {width: 0, height: 3},
      elevation: 3,
    },
    desktopScaffTagDropdownPosition: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 48,
      zIndex: 120,
    },
    inlineScaffTagSuggestion: {
      minHeight: 42,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 9,
      paddingRight: 4,
    },
    inlineScaffTagSuggestionDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#E5E7EB',
    },
    inlineScaffTagSuggestionCopy: {flex: 1, minWidth: 0},
    inlineScaffTagSuggestionLabel: {
      color: '#6B7280',
      fontSize: 8,
      lineHeight: 10,
      fontWeight: '900',
      letterSpacing: 0.35,
      textTransform: 'uppercase',
    },
    inlineScaffTagSuggestionName: {
      color: '#111827',
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '900',
    },
    inlineScaffTagSuggestionReference: {
      color: '#4B5563',
      fontSize: 9,
      fontWeight: '900',
      marginHorizontal: 7,
    },
    inlineScaffTagSuggestionChevron: {
      color: '#9CA3AF',
      fontSize: 22,
      lineHeight: 24,
      fontWeight: '500',
      marginLeft: 2,
      marginRight: 7,
    },
    tableInputMultiline: {minHeight: 66, textAlignVertical: 'top'},
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderTopWidth: 1,
      borderTopColor: '#D9D9D9',
    },
    metricCell: {
      width: isWide ? '50%' : '100%',
      flexDirection: 'row',
      alignItems: 'center',
      borderRightWidth: isWide ? 1 : 0,
      borderRightColor: '#D9D9D9',
      borderBottomWidth: 1,
      borderBottomColor: '#D9D9D9',
      minHeight: 44,
    },
    metricCellWide: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    },
    metricSideLabel: {
      width: isWide ? 170 : 150,
      alignSelf: 'stretch',
      backgroundColor: '#FAFAFA',
      color: '#111111',
      fontSize: FontSize.md,
      fontWeight: '600',
      paddingHorizontal: 12,
      textAlignVertical: 'center',
      includeFontPadding: false,
      paddingVertical: 12,
    },
    metricSideInput: {
      flex: 1,
      height: 44,
      color: '#111111',
      paddingHorizontal: 12,
      paddingVertical: 0,
    },
    drawingNumberInputWrap: {
      flex: 1,
      minWidth: 0,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 8,
    },
    drawingNumberInput: {
      flex: 1,
      minWidth: 0,
      height: 44,
      color: '#111111',
      paddingHorizontal: 12,
      paddingVertical: 0,
    },
    drawingNumberLinkedInput: {
      flex: 1,
      minWidth: 0,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    drawingNumberLinkTapArea: {
      maxWidth: '70%',
      minHeight: 28,
      justifyContent: 'center',
      paddingRight: 8,
      flexShrink: 0,
    },
    drawingNumberLinkText: {
      color: Colors.primary,
      fontSize: isWide ? 13 : 15,
      lineHeight: isWide ? 18 : 20,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    linkedReferenceEditRow: {
      flex: 1,
      minWidth: 0,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 8,
    },
    linkedReferenceButton: {
      flex: 1,
      minHeight: 28,
      justifyContent: 'center',
    },
    linkedReferenceText: {
      color: Colors.primary,
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 18 : 14,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    drawingNumberHiddenInput: {
      flex: 1,
      minWidth: 24,
      height: 44,
      color: 'transparent',
      padding: 0,
    },
    drawingRegisterInlineButton: {
      height: 28,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    drawingRegisterInlineButtonText: {
      color: '#111111',
      fontSize: 11,
      fontWeight: '700',
    },
    optionRows: {gap: 10, paddingTop: 4},
    optionRow: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: 10,
    },
    optionRowLabel: {
      width: isWide ? 150 : '100%',
      fontSize: 15,
      fontWeight: '800',
      color: '#111111',
      textAlign: 'left',
    },
    optionRowChoices: {
      flex: isWide ? 1 : undefined,
      width: isWide ? undefined : '100%',
      flexDirection: 'row',
      flexWrap: isWide ? 'nowrap' : 'wrap',
      gap: isWide ? 0 : 14,
      justifyContent: isWide ? 'center' : 'flex-start',
      alignItems: 'center',
    },
    checkboxChoice: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 14,
      flex: isWide ? 1 : 0,
      maxWidth: isWide ? undefined : '100%',
    },
    checkboxSquareWrap: {
      width: isWide ? 34 : undefined,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChoiceInner: {
      width: isWide ? 200 : undefined,
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    checkboxChoiceWide: {
      width: isWide ? '33.3333%' : undefined,
      paddingHorizontal: isWide ? 8 : 0,
    },
    checkboxSquare: {
      width: 28,
      height: 28,
      borderWidth: 2,
      borderColor: '#111111',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F3F4F6',
    },
    checkboxSquareActive: {backgroundColor: '#EAF2FF'},
    checkboxTick: {fontSize: 18, fontWeight: '800', color: '#2F80ED'},
    checkboxChoiceText: {
      fontSize: 15,
      color: '#111111',
      textAlign: 'left',
      flexShrink: 1,
    },
    pageColumns: {gap: 14},
    pageColumn: {gap: 14},
    pageSection: {gap: 0},
    checklistCard: {borderWidth: 1, borderTopWidth: 0, borderColor: '#D9D9D9'},
    checklistRow: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
      backgroundColor: '#FFFFFF',
    },
    checklistLabel: {
      flex: isWide ? 1 : undefined,
      width: isWide ? undefined : '100%',
      backgroundColor: '#FAFAFA',
      color: '#111111',
      fontSize: FontSize.md,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRightWidth: isWide ? 1 : 0,
      borderRightColor: '#D9D9D9',
      borderBottomWidth: isWide ? 0 : 1,
      borderBottomColor: '#D9D9D9',
    },
    statusGroup: {
      flexDirection: 'row',
      gap: isWide ? 8 : 8,
      paddingHorizontal: 10,
      paddingBottom: isWide ? 0 : 12,
      paddingTop: isWide ? 0 : 2,
      justifyContent: isWide ? 'space-between' : 'flex-start',
      width: isWide ? 228 : undefined,
      minWidth: isWide ? 228 : undefined,
      alignSelf: isWide ? 'center' : 'flex-start',
    },
    statusPill: {
      minWidth: isWide ? 0 : 46,
      width: isWide ? undefined : undefined,
      flex: isWide ? 1 : 0,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
    },
    statusPillActive: {
      borderColor: '#2F80ED',
      backgroundColor: '#EAF2FF',
    },
    statusPillText: {fontSize: 12, fontWeight: '700', color: '#6B7280'},
    statusPillTextActive: {color: '#1D4ED8'},
    correctiveTable: {borderWidth: 1, borderTopWidth: 0, borderColor: '#D9D9D9'},
    correctiveHeaderRow: {flexDirection: 'row', backgroundColor: '#FAFAFA', borderTopWidth: 1, borderTopColor: '#D9D9D9'},
    correctiveHeaderText: {padding: 10, fontSize: 14, fontWeight: '800', color: '#111111'},
    correctiveRow: {flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB'},
    correctiveActionCol: {flex: 2},
    correctiveByCol: {flex: 1.6},
    correctiveDateCol: {width: isWide ? 140 : 104},
    correctiveInput: {
      minHeight: 74,
      paddingHorizontal: 10,
      paddingVertical: 10,
      color: '#111111',
      borderRightWidth: 1,
      borderRightColor: '#E5E7EB',
      textAlignVertical: 'top',
    },
    footerText: {fontSize: 12, color: '#111111', lineHeight: 18, paddingTop: 8},
    photosGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: '#D9D9D9',
    },
    photoSlot: {
      width: '33.3333%',
      aspectRatio: 0.8,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderRightColor: '#D9D9D9',
      borderBottomColor: '#D9D9D9',
      backgroundColor: '#F8FAFC',
    },
    photoImage: {width: '100%', height: '100%'},
    photoPlaceholder: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    photoPlaceholderIcon: {fontSize: isWide ? 44 : 34, color: '#C0C0C0'},
    commentsBand: {alignItems: 'flex-start', backgroundColor: '#F4DEC2', borderColor: '#E0C5A1'},
    commentsBandText: {fontSize: 15, fontWeight: '700', color: '#333333'},
    commentsInput: {
      minHeight: isWide ? 240 : 200,
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: '#D9D9D9',
      paddingHorizontal: 12,
      paddingVertical: 12,
      textAlignVertical: 'top',
      color: '#111111',
    },
    signatureGrid: {flexDirection: isWide ? 'row' : 'column', gap: 24},
    signatureField: {flex: 1, gap: 8},
    signatureLabel: {fontSize: 15, fontWeight: '800', color: '#111111'},
    signatureNameInput: {
      height: 42,
      borderBottomWidth: 1,
      borderBottomColor: '#BDBDBD',
      color: '#111111',
      paddingHorizontal: 4,
    },
    signatureBox: {
      height: 112,
      borderWidth: 2,
      borderColor: '#222222',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      position: 'relative',
    },
    signaturePlaceholder: {textAlign: 'center', color: '#9CA3AF', marginTop: 40},
    licenceRow: {flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'center' : 'stretch', gap: 12},
    licenceInput: {
      width: isWide ? 180 : 170,
      maxWidth: '100%',
      height: 42,
      borderBottomWidth: 1,
      borderBottomColor: '#BDBDBD',
      color: '#111111',
      paddingHorizontal: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.35)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.md,
    },
    signatureModalCard: {
      width: '100%',
      maxWidth: 560,
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    signatureModalTitle: {fontSize: FontSize.lg, fontWeight: '700', color: '#111111'},
    signatureCanvas: {
      height: 240,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: BorderRadius.sm,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
    },
    signatureActionRow: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10},
    signatureActionBtn: {
      minWidth: 104,
      height: 40,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.md,
    },
    signatureActionText: {color: '#FFFFFF', fontWeight: '700'},
    drawingRegisterCard: {
      width: '100%',
      maxWidth: 680,
      maxHeight: '78%',
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    drawingBreadcrumbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    drawingBreadcrumbButton: {
      maxWidth: 180,
      height: 32,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#F9FAFB',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    drawingBreadcrumbText: {color: '#111111', fontSize: FontSize.sm, fontWeight: '700'},
    drawingRegisterMessage: {fontSize: FontSize.sm, color: '#B42318'},
    drawingRegisterList: {maxHeight: 420},
    drawingRegisterEmptyList: {minHeight: 120, justifyContent: 'center'},
    drawingRegisterEmptyText: {textAlign: 'center', color: '#6B7280', fontSize: FontSize.sm},
    drawingRegisterItem: {
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: BorderRadius.sm,
      marginBottom: 8,
      backgroundColor: '#F9FAFB',
    },
    drawingRegisterItemTitle: {fontSize: FontSize.md, fontWeight: '700', color: '#111111'},
    drawingRegisterItemPath: {fontSize: FontSize.sm, color: '#6B7280', marginTop: 4},
    userAvatarButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    userAvatarImage: {width: '100%', height: '100%'},
    userAvatarFallback: {
      width: '100%',
      height: '100%',
      borderRadius: 19,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userAvatarFallbackText: {color: '#FFFFFF', fontWeight: '700'},
  });
}
