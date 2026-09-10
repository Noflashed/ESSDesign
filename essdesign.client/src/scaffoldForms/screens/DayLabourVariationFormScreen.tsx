// Derived from ESSApp/src/screens/DayLabourVariationFormScreen.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import {formatMetres} from '../utils/measurements';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
  useWindowDimensions,
} from '../browser/runtime';
import Feather from '../browser/Feather';
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
import {pickFormImage} from '../native/profileImagePicker';
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
  DayLabourLabourRow,
  DayLabourMaterialMode,
  DayLabourWorkType,
  SignatureStroke,
  getDayLabourVariationForm,
  getDayLabourVariationPdfUrl,
  getDayLabourVariationPhotoUrl,
  previewNextDayLabourVariationNumber,
  saveDayLabourVariationForm,
  uploadDayLabourVariationPhoto,
} from '../services/supabaseDayLabourForms';
import {sydneyTodayDisplayDate} from '../utils/sydneyTime';
import {
  collectProjectDataRecipientEmails,
  projectDataPdfFileName,
} from '../utils/projectDataEmail';
import {
  HandoverCertificateListItem,
  listHandoverCertificateForms,
} from '../services/supabaseHandoverCertificates';
import {
  buildMaterialListColumns,
  filterMaterialPickerItems,
  formatSelectedMaterialList,
  materialListToItemValues,
  materialQuantityKey,
} from '../utils/materialSelection';
import {
  hideProjectDataWorkflowDemo,
  shouldShowProjectDataWorkflowDemo,
} from '../utils/projectDataWorkflowDemoPreference';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DayLabourVariationForm'>;
  route: RouteProp<RootStackParamList, 'DayLabourVariationForm'>;
};

type ExistingPhoto = {slot: number; path: string; url: string};
type PendingPhoto = {slot: number; uri: string; fileName: string};
type SignatureTarget = 'ess' | 'client';
type DatePickerTarget = {type: 'formDate'} | {type: 'labourDate'; index: number};
type DrawingBrowserItem = {type: 'folder'; data: Folder} | {type: 'document'; data: DesignDocument};

type FormState = {
  companyEntityId: CompanyEntityId;
  variationNumber: string;
  formReferenceName: string;
  clientProjectName: string;
  date: string;
  requestedBy: string;
  siteInstructionNumber: string;
  handoverDocumentNumber: string;
  handoverDocumentId: string;
  handoverDocumentTitle: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty' | '';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
  locationLevelGridLine: string;
  scaffoldLength: string;
  scaffoldWidth: string;
  scaffoldHeight: string;
  workingDecks: string;
  access: string;
  descriptionOfWork: string;
  workTypes: Record<DayLabourWorkType, boolean>;
  labourRows: DayLabourLabourRow[];
  transportIncluded: string;
  engineerRequired: boolean | null;
  additionalMaterialMode: DayLabourMaterialMode;
  materialList: string;
  essRepresentativeName: string;
  essRepresentativeSignature: string;
  essRepresentativeSignatureStrokes: SignatureStroke[];
  clientName: string;
  clientSignature: string;
  clientSignatureStrokes: SignatureStroke[];
};

const PHOTO_SLOTS = [0, 1, 2];
const IOS_DOCUMENT_PAGE_WIDTH = 920;
const IOS_DOCUMENT_PAGE_MAX_CONTENT_HEIGHT = 1480;
const IOS_DOCUMENT_PAGE_CANVAS_GUTTER = 8;
const WORK_TYPE_OPTIONS: Array<[DayLabourWorkType, string]> = [
  ['erect', 'Erect'],
  ['dismantle', 'Dismantle'],
  ['modification', 'Modification / Alteration'],
  ['hopUps', 'Hop Ups'],
];

function nowDate(): string {
  return sydneyTodayDisplayDate();
}

function formatFormDate(date: Date): string {
  return `${`${date.getDate()}`.padStart(2, '0')}/${`${date.getMonth() + 1}`.padStart(2, '0')}/${date.getFullYear()}`;
}

function parseFormDate(value: string): Date | null {
  const trimmed = value.trim();
  const displayMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (displayMatch) {
    const day = Number(displayMatch[1]);
    const month = Number(displayMatch[2]) - 1;
    const year = Number(displayMatch[3]);
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
  }
  return null;
}

function emptyLabourRows(): DayLabourLabourRow[] {
  return [{date: '', men: '', hours: '', total: ''}];
}

function blankLabourRow(): DayLabourLabourRow {
  return {date: '', men: '', hours: '', total: ''};
}

function sanitizeDecimal(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) {
    return cleaned;
  }
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
}

function cleanHandoverNumber(value: string): string {
  return value.replace(/\D/g, '');
}

function sanitizeHandoverInput(value: string): string {
  return cleanHandoverNumber(value);
}

function calculateLabourTotal(menValue: string, hoursValue: string): string {
  const men = Number(menValue);
  const hours = Number(hoursValue);
  if (!Number.isFinite(men) || !Number.isFinite(hours) || men <= 0 || hours <= 0) {
    return '';
  }
  const total = men * hours;
  return Number.isInteger(total) ? String(total) : String(Number(total.toFixed(2)));
}

function isPickerCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as {code?: unknown; message?: unknown};
  return maybeError.code === 'E_PICKER_CANCELLED'
    || (typeof maybeError.message === 'string' && (
      maybeError.message.includes('E_PICKER_CANCELLED')
      || maybeError.message.toLowerCase().includes('cancelled')
      || maybeError.message.toLowerCase().includes('canceled')
    ));
}

function readLayoutSize(event: {nativeEvent?: {layout?: {width?: number; height?: number}}} | undefined): {width: number; height: number} {
  const layout = event?.nativeEvent?.layout;
  return {
    width: typeof layout?.width === 'number' ? layout.width : 0,
    height: typeof layout?.height === 'number' ? layout.height : 0,
  };
}

function getDocumentDisplayName(item: DesignDocument): string {
  return item.essDesignIssueName || item.thirdPartyDesignName || item.description || `Revision ${item.revisionNumber}`;
}

function getDrawingDocumentType(item: DesignDocument): 'ess' | 'thirdparty' | '' {
  if (item.essDesignIssuePath) {
    return 'ess';
  }
  if (item.thirdPartyDesignPath) {
    return 'thirdparty';
  }
  return '';
}

function serializeFormState(form: FormState): string {
  return JSON.stringify({
    ...form,
    labourRows: form.labourRows.map(row => ({...row})),
    workTypes: {...form.workTypes},
  });
}

export default function DayLabourVariationFormScreen({navigation, route}: Props) {
  const prefs = usePreferences();
  const folders = useFolders();
  const {loadNotificationRecipients, notificationRecipients} = folders;
  const {user} = useAuth();
  const theme = getTheme(prefs.themeMode);
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const usesIOSDocumentEditor = true; // Same document editor on web.
  const isIOSDevice = Platform.OS === 'ios';
  const isWide = width >= 1024 || usesIOSDocumentEditor;
  const isPhoneLayout = width < 700 && !usesIOSDocumentEditor;
  const styles = React.useMemo(() => makeStyles(theme, isWide, isPhoneLayout), [theme, isPhoneLayout, isWide]);
  const isReadOnly = route.params.readOnly === true;

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
  const [documentPagerWidth, setDocumentPagerWidth] = React.useState(0);
  const [documentPagerHeight, setDocumentPagerHeight] = React.useState(0);
  const [documentPageHeight, setDocumentPageHeight] = React.useState(IOS_DOCUMENT_PAGE_MAX_CONTENT_HEIGHT);
  const [formId, setFormId] = React.useState(route.params.formId ?? '');
  const [createdAt, setCreatedAt] = React.useState<string | undefined>(undefined);
  const [existingPhotos, setExistingPhotos] = React.useState<ExistingPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = React.useState<PendingPhoto[]>([]);
  const [showSignatureModal, setShowSignatureModal] = React.useState(false);
  const [signatureTarget, setSignatureTarget] = React.useState<SignatureTarget>('ess');
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [datePickerTarget, setDatePickerTarget] = React.useState<DatePickerTarget | null>(null);
  const [calendarMonth, setCalendarMonth] = React.useState(new Date());
  const [showHandoverPicker, setShowHandoverPicker] = React.useState(false);
  const [handoverPickerItems, setHandoverPickerItems] = React.useState<HandoverCertificateListItem[]>([]);
  const [handoverPickerLoading, setHandoverPickerLoading] = React.useState(false);
  const [handoverPickerError, setHandoverPickerError] = React.useState('');
  const [showMaterialPicker, setShowMaterialPicker] = React.useState(false);
  const [manualMaterialEntryEnabled, setManualMaterialEntryEnabled] = React.useState(false);
  const [materialSearchText, setMaterialSearchText] = React.useState('');
  const [materialDraftValues, setMaterialDraftValues] = React.useState<Record<string, string>>({});
  const [isEditingScaffoldLength, setIsEditingScaffoldLength] = React.useState(false);
  const [isEditingScaffoldWidth, setIsEditingScaffoldWidth] = React.useState(false);
  const [isEditingScaffoldHeight, setIsEditingScaffoldHeight] = React.useState(false);
  const [signaturePreviewSize, setSignaturePreviewSize] = React.useState<Record<SignatureTarget, {width: number; height: number}>>({
    ess: {width: 0, height: 0},
    client: {width: 0, height: 0},
  });
  const [showDrawingRegister, setShowDrawingRegister] = React.useState(false);
  const [drawingRootFolders, setDrawingRootFolders] = React.useState<Folder[]>([]);
  const [drawingCurrentFolder, setDrawingCurrentFolder] = React.useState<Folder | null>(null);
  const [drawingBreadcrumbs, setDrawingBreadcrumbs] = React.useState<BreadcrumbItem[]>([]);
  const [drawingRegisterLoading, setDrawingRegisterLoading] = React.useState(false);
  const [drawingRegisterError, setDrawingRegisterError] = React.useState('');
  const drawingRootCacheRef = React.useRef<Folder[] | null>(null);
  const drawingFolderCacheRef = React.useRef<Map<string, {folder: Folder; breadcrumbs: BreadcrumbItem[]}>>(new Map());
  const baselineSnapshotRef = React.useRef<string | null>(null);
  const companySelectionTouchedRef = React.useRef(false);

  const initialFormState = React.useMemo<FormState>(() => ({
    companyEntityId: route.params.initialCompanyEntityId ?? DEFAULT_COMPANY_ENTITY_ID,
    variationNumber: '',
    formReferenceName: '',
    clientProjectName: route.params.projectName,
    date: nowDate(),
    requestedBy: '',
    siteInstructionNumber: '',
    handoverDocumentNumber: '',
    handoverDocumentId: '',
    handoverDocumentTitle: '',
    drawingDocumentId: '',
    drawingDocumentType: '',
    drawingDocumentName: '',
    drawingRevisionNumber: '',
    drawingFolderId: '',
    locationLevelGridLine: '',
    scaffoldLength: '',
    scaffoldWidth: '',
    scaffoldHeight: '',
    workingDecks: '',
    access: '',
    descriptionOfWork: '',
    workTypes: {erect: false, dismantle: false, modification: false, hopUps: false},
    labourRows: emptyLabourRows(),
    transportIncluded: '',
    engineerRequired: null,
    additionalMaterialMode: '',
    materialList: '',
    essRepresentativeName: user?.fullName ?? '',
    essRepresentativeSignature: '',
    essRepresentativeSignatureStrokes: [],
    clientName: '',
    clientSignature: '',
    clientSignatureStrokes: [],
  }), [route.params.projectName, route.params.initialCompanyEntityId, user?.fullName]);
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const company = getCompanyEntity(form.companyEntityId);
  const representativeLabel = companyRepresentativeLabel(company.id);
  const [variationNumberPreview, setVariationNumberPreview] = React.useState('');
  const [userHasEdited, setUserHasEdited] = React.useState(false);
  const currentSnapshot = React.useMemo(() => serializeFormState(form), [form]);
  const hasUnsavedChanges = !isReadOnly && userHasEdited && baselineSnapshotRef.current !== null && (
    currentSnapshot !== baselineSnapshotRef.current || pendingPhotos.length > 0
  );

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
  const filteredMaterialItems = React.useMemo(() => {
    return filterMaterialPickerItems(materialSearchText);
  }, [materialSearchText]);
  const materialListColumns = React.useMemo(
    () => buildMaterialListColumns(form.materialList, {maxRows: isPhoneLayout ? 8 : 4, maxColumns: isPhoneLayout ? 1 : isWide ? 4 : 3}),
    [form.materialList, isPhoneLayout, isWide],
  );

  React.useEffect(() => {
    if (folders.rootFolders.length > 0) {
      drawingRootCacheRef.current = folders.rootFolders;
      return;
    }
    if (drawingRootCacheRef.current) {
      return;
    }
    let isMounted = true;
    api.getRootFolders()
      .then(root => {
        if (isMounted) {
          drawingRootCacheRef.current = root;
        }
      })
      .catch(() => {
        // Non-blocking warmup.
      });
    return () => {
      isMounted = false;
    };
  }, [folders.rootFolders]);

  React.useEffect(() => {
    let isMounted = true;
    if (!route.params.formId) {
      setUserHasEdited(false);
      baselineSnapshotRef.current = serializeFormState(initialFormState);
      previewNextDayLabourVariationNumber(route.params.builderId, route.params.projectId)
        .then(nextNumber => {
          if (isMounted) {
            setVariationNumberPreview(nextNumber);
          }
        })
        .catch(() => {
          // Saving remains authoritative if the preview cannot be loaded.
        });
      return () => {
        isMounted = false;
      };
    }

    (async () => {
      setLoading(true);
      try {
        const existing = await getDayLabourVariationForm(route.params.builderId, route.params.projectId, route.params.formId as string);
        if (!existing || !isMounted) {
          return;
        }
        const nextState: FormState = {
          companyEntityId: existing.companyEntityId,
          variationNumber: existing.variationNumber,
          formReferenceName: existing.formReferenceName,
          clientProjectName: existing.clientProjectName,
          date: existing.date,
          requestedBy: existing.requestedBy,
          siteInstructionNumber: existing.siteInstructionNumber,
          handoverDocumentNumber: cleanHandoverNumber(existing.handoverDocumentNumber),
          handoverDocumentId: existing.handoverDocumentId,
          handoverDocumentTitle: existing.handoverDocumentTitle,
          drawingDocumentId: existing.drawingDocumentId,
          drawingDocumentType: existing.drawingDocumentType,
          drawingDocumentName: existing.drawingDocumentName,
          drawingRevisionNumber: existing.drawingRevisionNumber,
          drawingFolderId: existing.drawingFolderId,
          locationLevelGridLine: existing.locationLevelGridLine,
          scaffoldLength: existing.scaffoldLength,
          scaffoldWidth: existing.scaffoldWidth,
          scaffoldHeight: existing.scaffoldHeight,
          workingDecks: existing.workingDecks,
          access: existing.access,
          descriptionOfWork: existing.descriptionOfWork,
          workTypes: existing.workTypes,
          labourRows: existing.labourRows.length > 0 ? existing.labourRows.slice(0, 4) : emptyLabourRows(),
          transportIncluded: existing.transportIncluded,
          engineerRequired: existing.engineerRequired,
          additionalMaterialMode: existing.additionalMaterialMode,
          materialList: existing.materialList,
          essRepresentativeName: existing.essRepresentativeName,
          essRepresentativeSignature: existing.essRepresentativeSignature,
          essRepresentativeSignatureStrokes: existing.essRepresentativeSignatureStrokes ?? [],
          clientName: existing.clientName,
          clientSignature: existing.clientSignature,
          clientSignatureStrokes: existing.clientSignatureStrokes ?? [],
        };
        setFormId(existing.id);
        setCreatedAt(existing.createdAt);
        setForm(nextState);
        setUserHasEdited(false);
        baselineSnapshotRef.current = serializeFormState(nextState);
        const photoUrls = await Promise.all(
          existing.photoSlots.map(async item => ({slot: item.slot, path: item.path, url: await getDayLabourVariationPhotoUrl(item.path)})),
        );
        if (isMounted) {
          setExistingPhotos(photoUrls);
          setPendingPhotos([]);
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
    if (route.params.formId || route.params.initialCompanyEntityId) {
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
    route.params.initialCompanyEntityId,
    route.params.formId,
    route.params.projectId,
    route.params.projectName,
  ]);

  const goDesignRoot = () => {
    folders.goToRoot();
    folders.clearSearch();
    navigation.reset({index: 0, routes: [{name: 'Home'}]});
    folders.loadRootFolders().catch(() => {
      // Home handles load state.
    });
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setUserHasEdited(true);
    setForm(prev => ({...prev, [key]: value}));
  };

  const openMaterialSelection = () => {
    if (isReadOnly) {
      return;
    }

    setMaterialDraftValues(materialListToItemValues(form.materialList));
    setMaterialSearchText('');
    setShowMaterialPicker(true);
  };

  const closeMaterialSelection = () => {
    setShowMaterialPicker(false);
    if (!form.materialList.trim()) {
      setManualMaterialEntryEnabled(true);
    }
  };

  const updateManualMaterialList = (value: string) => {
    const isEmpty = !value.trim();
    setUserHasEdited(true);
    setForm(prev => ({
      ...prev,
      materialList: isEmpty ? '' : value,
      additionalMaterialMode: isEmpty ? '' : 'below',
    }));
    if (isEmpty) {
      setManualMaterialEntryEnabled(false);
    }
  };

  const updateMaterialDraftQuantity = (key: string, value: string) => {
    const clean = value.replace(/[^0-9]/g, '');
    setMaterialDraftValues(prev => ({...prev, [key]: clean}));
  };

  const saveMaterialSelection = () => {
    const selectedMaterialList = formatSelectedMaterialList(materialDraftValues);
    if (!selectedMaterialList) {
      Alert.alert('No materials selected', 'Enter at least one material quantity before saving.');
      return;
    }

    setUserHasEdited(true);
    setForm(prev => ({
      ...prev,
      materialList: selectedMaterialList,
      additionalMaterialMode: 'below',
    }));
    setManualMaterialEntryEnabled(false);
    setShowMaterialPicker(false);
  };

  const renderMaterialListGrid = (textStyle: object) => (
    <View style={styles.materialListGrid}>
      {materialListColumns.map((column, columnIndex) => (
        <View key={`material-column-${columnIndex}`} style={styles.materialListColumn}>
          {column.map((entry, entryIndex) => (
            <Text key={`${entry}-${entryIndex}`} style={[styles.materialListGridText, textStyle]} numberOfLines={1}>
              {entry}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );

  const updateLabourRow = (index: number, key: keyof DayLabourLabourRow, value: string) => {
    setUserHasEdited(true);
    setForm(prev => {
      const next = [...prev.labourRows];
      next[index] = {...next[index], [key]: key === 'date' ? value : sanitizeDecimal(value)};
      if (key === 'men' || key === 'hours') {
        next[index].total = calculateLabourTotal(next[index].men, next[index].hours);
      }
      return {...prev, labourRows: next};
    });
  };

  const addLabourRow = () => {
    if (isReadOnly) {
      return;
    }
    setUserHasEdited(true);
    setForm(prev => ({
      ...prev,
      labourRows: prev.labourRows.length >= 4 ? prev.labourRows : [...prev.labourRows, blankLabourRow()],
    }));
  };

  const openDatePicker = (target: DatePickerTarget, value: string) => {
    if (isReadOnly) {
      return;
    }
    const baseDate = parseFormDate(value) ?? new Date();
    setDatePickerTarget(target);
    setCalendarMonth(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    setShowDatePicker(true);
  };

  const applyPickedDate = (date: Date) => {
    if (!datePickerTarget) {
      return;
    }
    const nextValue = formatFormDate(date);
    if (datePickerTarget.type === 'formDate') {
      updateField('date', nextValue);
    } else {
      updateLabourRow(datePickerTarget.index, 'date', nextValue);
    }
    setShowDatePicker(false);
    setDatePickerTarget(null);
  };

  const renderCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDay; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  };

  const removeLabourRow = (index: number) => {
    if (isReadOnly || form.labourRows.length <= 1) {
      return;
    }
    setUserHasEdited(true);
    setForm(prev => ({
      ...prev,
      labourRows: prev.labourRows.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const renderSignatureStrokes = React.useCallback((strokes: SignatureStroke[], boxWidth: number, boxHeight: number) => {
    if (boxWidth <= 0 || boxHeight <= 0) {
      return null;
    }
    const strokeWidth = 2.5;
    const capSize = 3;
    const nodes: React.ReactNode[] = [];
    strokes.forEach((stroke, strokeIndex) => {
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
        const solidLength = length + (strokeWidth * 1.5);
        nodes.push(
          <View
            key={`sig-${strokeIndex}-${i}`}
            // eslint-disable-next-line react-native/no-inline-styles
            style={{
              position: 'absolute',
              left: (x1 + x2) / 2 - solidLength / 2,
              top: (y1 + y2) / 2 - strokeWidth / 2,
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
      if (last) {
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
      }
    });
    return nodes;
  }, []);

  const getPhotoForSlot = (slot: number) => {
    const pending = pendingPhotos.find(item => item.slot === slot);
    if (pending) {
      return {uri: pending.uri};
    }
    const existing = existingPhotos.find(item => item.slot === slot);
    return existing ? {uri: existing.url} : null;
  };

  const selectPhotoForSlot = React.useCallback((slot: number, source: 'camera' | 'library') => {
    setTimeout(() => {
      pickFormImage(source)
        .then(picked => {
          setUserHasEdited(true);
          setPendingPhotos(prev => [...prev.filter(item => item.slot !== slot), {slot, uri: picked.uri, fileName: picked.fileName || `variation-${slot + 1}.jpg`}]);
        })
        .catch(e => {
          if (!isPickerCancellation(e)) {
            const message = e instanceof Error ? e.message : '';
            Alert.alert('Photo unavailable', message || 'Could not add photo.');
          }
        });
    }, 120);
  }, []);

  const pickPhoto = async (slot: number) => {
    if (isReadOnly) {
      return;
    }
    Alert.alert('Add Photo', 'Choose image source', [
      {
        text: 'Take Photo',
        onPress: () => selectPhotoForSlot(slot, 'camera'),
      },
      {
        text: 'Choose Existing',
        onPress: () => selectPhotoForSlot(slot, 'library'),
      },
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const loadDrawingRegisterRoot = React.useCallback(async () => {
    setDrawingRegisterError('');
    if (drawingRootCacheRef.current) {
      setDrawingRootFolders(drawingRootCacheRef.current);
      setDrawingCurrentFolder(null);
      setDrawingBreadcrumbs([]);
      return;
    }
    setDrawingRegisterLoading(true);
    try {
      const root = await api.getRootFolders();
      drawingRootCacheRef.current = root;
      setDrawingRootFolders(root);
      setDrawingCurrentFolder(null);
      setDrawingBreadcrumbs([]);
    } catch (error) {
      setDrawingRegisterError(error instanceof Error ? error.message : 'Could not load ESS Design.');
    } finally {
      setDrawingRegisterLoading(false);
    }
  }, []);

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
      const [folder, crumbs] = await Promise.all([api.getFolder(folderId), api.getBreadcrumbs(folderId)]);
      drawingFolderCacheRef.current.set(folderId, {folder, breadcrumbs: crumbs});
      setDrawingCurrentFolder(folder);
      setDrawingBreadcrumbs(crumbs);
    } catch (error) {
      setDrawingRegisterError(error instanceof Error ? error.message : 'Could not open folder.');
    } finally {
      setDrawingRegisterLoading(false);
    }
  }, []);

  const selectDrawingRegisterDocument = React.useCallback((item: DesignDocument) => {
    const name = getDocumentDisplayName(item);
    const documentType = getDrawingDocumentType(item);
    setUserHasEdited(true);
    setForm(prev => ({
      ...prev,
      handoverDocumentNumber: prev.handoverDocumentNumber || name.replace(/\.pdf$/i, ''),
      handoverDocumentId: '',
      handoverDocumentTitle: '',
      drawingDocumentId: documentType ? item.id : '',
      drawingDocumentType: documentType,
      drawingDocumentName: name,
      drawingRevisionNumber: item.revisionNumber,
      drawingFolderId: item.folderId,
    }));
    setShowDrawingRegister(false);
  }, []);

  const loadHandoverPickerItems = React.useCallback(async () => {
    setHandoverPickerError('');
    setHandoverPickerLoading(true);
    try {
      const nextItems = await listHandoverCertificateForms(route.params.builderId, route.params.projectId);
      setHandoverPickerItems(nextItems);
    } catch (error) {
      setHandoverPickerError(error instanceof Error ? error.message : 'Could not load handover forms.');
      setHandoverPickerItems([]);
    } finally {
      setHandoverPickerLoading(false);
    }
  }, [route.params.builderId, route.params.projectId]);

  const openHandoverPicker = React.useCallback(() => {
    if (isReadOnly) {
      return;
    }
    setShowHandoverPicker(true);
    loadHandoverPickerItems().catch(() => {
      // State is handled in loadHandoverPickerItems.
    });
  }, [isReadOnly, loadHandoverPickerItems]);

  const selectHandoverForm = React.useCallback((item: HandoverCertificateListItem) => {
    const handoverNumber = cleanHandoverNumber(item.inspectionNumber || item.formReferenceName);
    setUserHasEdited(true);
    setForm(prev => ({
      ...prev,
      handoverDocumentNumber: handoverNumber,
      handoverDocumentId: item.id,
      handoverDocumentTitle: item.formReferenceName || '',
      drawingDocumentId: '',
      drawingDocumentType: '',
      drawingDocumentName: '',
      drawingRevisionNumber: '',
      drawingFolderId: '',
    }));
    setShowHandoverPicker(false);
  }, []);

  const openLinkedHandoverForm = React.useCallback(() => {
    if (!form.handoverDocumentId) {
      return;
    }
    navigation.navigate('HandoverCertificateForm', {
      builderId: route.params.builderId,
      builderName: route.params.builderName,
      projectId: route.params.projectId,
      projectName: route.params.projectName,
      formId: form.handoverDocumentId,
      readOnly: true,
    });
  }, [
    form.handoverDocumentId,
    navigation,
    route.params.builderId,
    route.params.builderName,
    route.params.projectId,
    route.params.projectName,
  ]);

  const openLinkedDrawingDocument = React.useCallback(async () => {
    if (!form.drawingDocumentId || !form.drawingDocumentType) {
      return;
    }
    try {
      const result = await api.getDownloadUrl(form.drawingDocumentId, form.drawingDocumentType);
      navigation.navigate('PDFViewer', {
        url: result.url,
        title: form.drawingDocumentName || form.handoverDocumentNumber || 'Drawing',
      });
    } catch (error) {
      Alert.alert(
        'Drawing unavailable',
        error instanceof Error ? error.message : 'Could not open the selected drawing.',
      );
    }
  }, [
    form.drawingDocumentId,
    form.drawingDocumentName,
    form.drawingDocumentType,
    form.handoverDocumentNumber,
    navigation,
  ]);

  const drawingBrowserItems = React.useMemo<DrawingBrowserItem[]>(() => {
    if (!drawingCurrentFolder) {
      return drawingRootFolders.map(folder => ({type: 'folder' as const, data: folder}));
    }
    return [
      ...drawingCurrentFolder.subFolders.map(folder => ({type: 'folder' as const, data: folder})),
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
    setUserHasEdited(true);
    if (signatureTarget === 'ess') {
      setForm(prev => ({...prev, essRepresentativeSignature: '', essRepresentativeSignatureStrokes: strokes}));
    } else {
      setForm(prev => ({...prev, clientSignature: '', clientSignatureStrokes: strokes}));
    }
    setShowSignatureModal(false);
  };

  const handleSave = async () => {
    if (isReadOnly) {
      return;
    }
    if (!form.clientProjectName.trim()) {
      Alert.alert('Project/client required', 'Enter the client / project name before saving.');
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
            path: await uploadDayLabourVariationPhoto(route.params.builderId, route.params.projectId, nextId, item.slot, item.uri, item.fileName),
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

      const normalizedLabourRows = form.labourRows.map(row => ({
        ...row,
        total: calculateLabourTotal(row.men, row.hours),
      }));

      const saved = await saveDayLabourVariationForm({
        id: nextId,
        createdAt,
        builderId: route.params.builderId,
        builderName: route.params.builderName,
        projectId: route.params.projectId,
        projectName: route.params.projectName,
        companyEntityId: form.companyEntityId,
        variationNumber: form.variationNumber.trim(),
        formReferenceName: form.formReferenceName.trim(),
        clientProjectName: form.clientProjectName.trim(),
        date: form.date.trim(),
        requestedBy: form.requestedBy.trim(),
        siteInstructionNumber: form.siteInstructionNumber.trim(),
        handoverDocumentNumber: cleanHandoverNumber(form.handoverDocumentNumber),
        handoverDocumentId: form.handoverDocumentId,
        handoverDocumentTitle: form.handoverDocumentTitle,
        drawingDocumentId: form.drawingDocumentId,
        drawingDocumentType: form.drawingDocumentType,
        drawingDocumentName: form.drawingDocumentName,
        drawingRevisionNumber: form.drawingRevisionNumber,
        drawingFolderId: form.drawingFolderId,
        locationLevelGridLine: form.locationLevelGridLine.trim(),
        scaffoldLength: form.scaffoldLength.trim(),
        scaffoldWidth: form.scaffoldWidth.trim(),
        scaffoldHeight: form.scaffoldHeight.trim(),
        workingDecks: form.workingDecks.trim(),
        access: form.access.trim(),
        descriptionOfWork: form.descriptionOfWork.trim(),
        workTypes: form.workTypes,
        labourRows: normalizedLabourRows,
        transportIncluded: form.transportIncluded.trim(),
        engineerRequired: form.engineerRequired,
        additionalMaterialMode: form.additionalMaterialMode,
        materialList: form.materialList.trim(),
        photoSlots: uploadedPhotos,
        essRepresentativeName: form.essRepresentativeName.trim(),
        essRepresentativeSignature: form.essRepresentativeSignature.trim(),
        essRepresentativeSignatureStrokes: form.essRepresentativeSignatureStrokes,
        clientName: form.clientName.trim(),
        clientSignature: form.clientSignature.trim(),
        clientSignatureStrokes: form.clientSignatureStrokes,
      });

      const nextState: FormState = {
        companyEntityId: saved.companyEntityId,
        variationNumber: saved.variationNumber,
        formReferenceName: saved.formReferenceName,
        clientProjectName: saved.clientProjectName,
        date: saved.date,
        requestedBy: saved.requestedBy,
        siteInstructionNumber: saved.siteInstructionNumber,
        handoverDocumentNumber: cleanHandoverNumber(saved.handoverDocumentNumber),
        handoverDocumentId: saved.handoverDocumentId,
        handoverDocumentTitle: saved.handoverDocumentTitle,
        drawingDocumentId: saved.drawingDocumentId,
        drawingDocumentType: saved.drawingDocumentType,
        drawingDocumentName: saved.drawingDocumentName,
        drawingRevisionNumber: saved.drawingRevisionNumber,
        drawingFolderId: saved.drawingFolderId,
        locationLevelGridLine: saved.locationLevelGridLine,
        scaffoldLength: saved.scaffoldLength,
        scaffoldWidth: saved.scaffoldWidth,
        scaffoldHeight: saved.scaffoldHeight,
        workingDecks: saved.workingDecks,
        access: saved.access,
        descriptionOfWork: saved.descriptionOfWork,
        workTypes: saved.workTypes,
        labourRows: saved.labourRows.length > 0 ? saved.labourRows.slice(0, 4) : emptyLabourRows(),
        transportIncluded: saved.transportIncluded,
        engineerRequired: saved.engineerRequired,
        additionalMaterialMode: saved.additionalMaterialMode,
        materialList: saved.materialList,
        essRepresentativeName: saved.essRepresentativeName,
        essRepresentativeSignature: saved.essRepresentativeSignature,
        essRepresentativeSignatureStrokes: saved.essRepresentativeSignatureStrokes,
        clientName: saved.clientName,
        clientSignature: saved.clientSignature,
        clientSignatureStrokes: saved.clientSignatureStrokes,
      };
      baselineSnapshotRef.current = serializeFormState(nextState);
      setUserHasEdited(false);
      setForm(nextState);
      setFormId(saved.id);
      setCreatedAt(saved.createdAt);
      const photoUrls = await Promise.all(saved.photoSlots.map(async item => ({slot: item.slot, path: item.path, url: await getDayLabourVariationPhotoUrl(item.path)})));
      setExistingPhotos(photoUrls);
      setPendingPhotos([]);
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'Unable to save day labour/variation form.';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!formId || loading || hasUnsavedChanges) {
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
      const url = await getDayLabourVariationPdfUrl({
        builderId: route.params.builderId,
        projectId: route.params.projectId,
        formId,
      });
      setSharePdfUrl(url);
      setShowShareModal(true);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Could not load the day labour PDF.';
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
      const formTitle = form.formReferenceName || form.variationNumber || 'Day Labour/Variation';
      await api.shareProjectDataForm({
        recipientUserIds: selection.internalRecipients.map(recipient => recipient.id),
        externalEmails: selection.externalEmails,
        formType: 'Day Labour/Variation',
        formTitle,
        formNumber: form.variationNumber || variationNumberPreview,
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
        : 'Could not share the day labour PDF.';
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

    const formTitle = form.formReferenceName || form.variationNumber || 'Day Labour/Variation';
    const formNumber = form.variationNumber || variationNumberPreview;
    setShareEmailingAttachment(true);
    try {
      const result = await composeEmailWithPdf({
        to: recipients,
        subject: `${formTitle} – ${formNumber}`,
        body: `Please find attached the Day Labour/Variation PDF for ${route.params.projectName}.`,
        pdfUrl: sharePdfUrl,
        fileName: projectDataPdfFileName(`Day Labour Variation ${formNumber}`),
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

  const renderPdfTextInput = (
    value: string,
    onChangeText: (value: string) => void,
    options?: {
      style?: object | object[];
      multiline?: boolean;
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
      placeholder?: string;
      onPress?: () => void;
      pressableTextStyle?: object;
      displayValue?: string;
      editable?: boolean;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ) => {
    if (options?.onPress) {
      return (
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={isReadOnly}
          style={[styles.pdfInput, options.style, styles.pressablePdfInput]}
          onPress={options.onPress}>
          <Text style={[styles.pressablePdfInputText, options.pressableTextStyle]} numberOfLines={1}>
            {value || options.placeholder || ''}
          </Text>
          <Feather name="calendar" size={isWide ? 13 : 10} color="#333333" />
        </TouchableOpacity>
      );
    }
    return (
      <TextInput
        style={[styles.pdfInput, options?.style]}
        editable={!isReadOnly && options?.editable !== false}
        value={options?.displayValue ?? value}
        onChangeText={onChangeText}
        multiline={options?.multiline}
        keyboardType={options?.keyboardType}
        placeholder={options?.placeholder}
        placeholderTextColor="#8A8A8A"
        onFocus={options?.onFocus}
        onBlur={options?.onBlur}
      />
    );
  };

  const renderUnderlineField = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    options?: {
      wide?: boolean;
      leftAction?: React.ReactNode;
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
      onPress?: () => void;
      linkedOnPress?: () => void;
      inputPrefix?: string;
      inputSuffix?: string;
      displayValue?: string;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ) => (
    <View style={[styles.underlineField, options?.wide ? styles.underlineFieldWide : null]}>
      <Text style={styles.underlineLabel}>{label}:</Text>
      {options?.leftAction}
      <View style={styles.underlineInputWrap}>
        {options?.linkedOnPress && value ? (
          <View style={styles.linkedUnderlineEditRow}>
            <TouchableOpacity style={styles.linkedUnderlineTextButton} activeOpacity={0.75} onPress={options.linkedOnPress}>
              <Text style={styles.linkedUnderlineInputText} numberOfLines={1}>{options.inputPrefix ? `${options.inputPrefix} ${value}` : value}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.pdfInput, styles.underlineInput, styles.linkedUnderlineEditInput]}
              editable={!isReadOnly}
              onChangeText={onChangeText}
              onKeyPress={({nativeEvent}) => {
                if (nativeEvent.key === 'Backspace') {
                  onChangeText('');
                }
              }}
              keyboardType={options?.keyboardType}
              placeholder="Tap here to edit"
              placeholderTextColor="#8A8A8A"
            />
          </View>
        ) : options?.inputPrefix ? (
          <View style={styles.underlineInputPrefixRow}>
            <Text style={styles.underlineInputPrefix}>{options.inputPrefix}</Text>
            <TextInput
              style={[styles.pdfInput, styles.underlineInput, styles.underlineInputWithPrefix]}
              editable={!isReadOnly}
              value={options.displayValue ?? value}
              onChangeText={onChangeText}
              keyboardType={options?.keyboardType}
              placeholderTextColor="#8A8A8A"
              onFocus={options.onFocus}
              onBlur={options.onBlur}
            />
          </View>
        ) : options?.inputSuffix ? (
          <View style={styles.underlineInputPrefixRow}>
            <TextInput
              style={[styles.pdfInput, styles.underlineInput, styles.underlineInputWithPrefix]}
              editable={!isReadOnly}
              value={options.displayValue ?? value}
              onChangeText={onChangeText}
              keyboardType={options?.keyboardType}
              placeholderTextColor="#8A8A8A"
              onFocus={options.onFocus}
              onBlur={options.onBlur}
            />
            <Text style={styles.underlineInputSuffix}>{options.inputSuffix}</Text>
          </View>
        ) : (
          renderPdfTextInput(value, onChangeText, {
            style: styles.underlineInput,
            keyboardType: options?.keyboardType,
            onPress: options?.onPress,
            pressableTextStyle: styles.underlinePressableText,
            displayValue: options?.displayValue,
            onFocus: options?.onFocus,
            onBlur: options?.onBlur,
          })
        )}
      </View>
    </View>
  );

  const renderTickBox = (active: boolean, onPress: () => void, size: 'sm' | 'md' = 'md') => (
    <TouchableOpacity
      activeOpacity={isReadOnly ? 1 : 0.8}
      disabled={isReadOnly}
      style={[styles.pdfTickBox, size === 'sm' ? styles.pdfTickBoxSmall : null]}
      onPress={onPress}>
      {active ? <Feather name="check" size={size === 'sm' ? 17 : 24} color="#2F80D1" /> : null}
    </TouchableOpacity>
  );

  const renderPhoneField = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    options?: {
      multiline?: boolean;
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
      onPress?: () => void;
      action?: React.ReactNode;
      linkedOnPress?: () => void;
      placeholder?: string;
      inputPrefix?: string;
      inputSuffix?: string;
      displayValue?: string;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ) => (
    <View style={styles.phoneField}>
      <View style={styles.phoneFieldHeader}>
        <Text style={styles.phoneFieldLabel}>{label}</Text>
      {options?.action}
      </View>
      {options?.linkedOnPress && value ? (
        <View style={styles.phoneLinkedEditField}>
          <TouchableOpacity style={styles.phoneLinkedTextButton} activeOpacity={0.75} onPress={options.linkedOnPress}>
            <Text style={styles.phoneLinkedFieldText} numberOfLines={1}>{options.inputPrefix ? `${options.inputPrefix} ${value}` : value}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.phoneLinkedEditInput}
            editable={!isReadOnly}
            onChangeText={onChangeText}
            onKeyPress={({nativeEvent}) => {
              if (nativeEvent.key === 'Backspace') {
                onChangeText('');
              }
            }}
            keyboardType={options?.keyboardType}
            placeholder="Tap here to edit"
            placeholderTextColor="#8A8A8A"
          />
        </View>
      ) : options?.inputPrefix ? (
        <View style={styles.phoneInputPrefixRow}>
          <Text style={styles.phoneInputPrefix}>{options.inputPrefix}</Text>
          <TextInput
          style={styles.phoneInputWithPrefix}
          editable={!isReadOnly}
          value={options.displayValue ?? value}
          onChangeText={onChangeText}
          keyboardType={options?.keyboardType}
          placeholder={options?.placeholder}
          placeholderTextColor="#8A8A8A"
          onFocus={options.onFocus}
          onBlur={options.onBlur}
        />
      </View>
    ) : options?.inputSuffix ? (
        <View style={styles.phoneInputPrefixRow}>
          <TextInput
            style={styles.phoneInputWithPrefix}
            editable={!isReadOnly}
            value={options.displayValue ?? value}
            onChangeText={onChangeText}
            keyboardType={options?.keyboardType}
            placeholder={options?.placeholder}
            placeholderTextColor="#8A8A8A"
            onFocus={options.onFocus}
            onBlur={options.onBlur}
          />
          <Text style={styles.phoneInputSuffix}>{options.inputSuffix}</Text>
        </View>
      ) : options?.onPress ? (
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={isReadOnly}
          style={styles.phonePressableField}
          onPress={options.onPress}>
          <Text style={styles.phonePressableFieldText} numberOfLines={1}>{value || options.placeholder || ''}</Text>
          <Feather name="calendar" size={18} color="#333333" />
        </TouchableOpacity>
      ) : (
        <TextInput
          style={[styles.phoneInput, options?.multiline ? styles.phoneInputMultiline : null]}
          editable={!isReadOnly}
          value={options?.displayValue ?? value}
          onChangeText={onChangeText}
          multiline={options?.multiline}
          keyboardType={options?.keyboardType}
          placeholder={options?.placeholder}
          placeholderTextColor="#8A8A8A"
          onFocus={options?.onFocus}
          onBlur={options?.onBlur}
        />
      )}
    </View>
  );

  const renderPhoneChoice = (label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      activeOpacity={isReadOnly ? 1 : 0.8}
      disabled={isReadOnly}
      style={[styles.phoneChoice, active ? styles.phoneChoiceActive : null]}
      onPress={onPress}>
      <View style={[styles.phoneChoiceBox, active ? styles.phoneChoiceBoxActive : null]}>
        {active ? <Feather name="check" size={18} color="#FFFFFF" /> : null}
      </View>
      <Text style={[styles.phoneChoiceText, active ? styles.phoneChoiceTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderPhonePhotoSlot = (slot: number) => {
    const photo = getPhotoForSlot(slot);
    return (
      <TouchableOpacity
        key={`phone-photo-${slot}`}
        activeOpacity={isReadOnly ? 1 : 0.85}
        disabled={isReadOnly}
        style={styles.phonePhotoSlot}
        onPress={() => pickPhoto(slot)}>
        {photo ? (
          <Image source={photo} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <View style={styles.phonePhotoPlaceholder}>
            <Feather name="camera" size={30} color="#B8B8B8" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderPhoneSignatureBlock = (
    target: SignatureTarget,
    label: string,
    name: string,
    strokes: SignatureStroke[],
    onNameChange: (value: string) => void,
  ) => (
    <View style={styles.phoneSignatureBlock}>
      {renderPhoneField(`${label} Name`, name, onNameChange)}
      <View style={styles.phoneField}>
        <Text style={styles.phoneFieldLabel}>{label} Signature</Text>
        <TouchableOpacity
          activeOpacity={isReadOnly ? 1 : 0.85}
          disabled={isReadOnly}
          style={styles.phoneSignatureBox}
          onPress={() => openSignatureModal(target)}
          onLayout={evt => {
            const nextSize = readLayoutSize(evt);
            setSignaturePreviewSize(prev => ({...prev, [target]: nextSize}));
          }}>
          {renderSignatureStrokes(strokes, signaturePreviewSize[target].width, signaturePreviewSize[target].height)}
          {strokes.length === 0 ? <Text style={styles.phoneSignaturePlaceholder}>Tap to sign</Text> : null}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDimensionLine = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    keyboardType: 'default' | 'decimal-pad' = 'decimal-pad',
    suffix?: string,
    options?: {
      displayValue?: string;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ) => (
    <View style={styles.dimensionField}>
      <Text style={styles.dimensionLabel}>{label} -</Text>
      {suffix ? (
        <View style={styles.dimensionInputSuffixRow}>
          {renderPdfTextInput(value, onChangeText, {
            style: [styles.dimensionInput, styles.dimensionInputWithSuffix],
            keyboardType,
            displayValue: options?.displayValue,
            onFocus: options?.onFocus,
            onBlur: options?.onBlur,
          })}
          <Text style={styles.dimensionInputSuffix}>{suffix}</Text>
        </View>
      ) : (
        renderPdfTextInput(value, onChangeText, {
          style: styles.dimensionInput,
          keyboardType,
          displayValue: options?.displayValue,
          onFocus: options?.onFocus,
          onBlur: options?.onBlur,
        })
      )}
    </View>
  );

  const renderPhotoPdfSlot = (slot: number) => {
    const photo = getPhotoForSlot(slot);
    return (
      <TouchableOpacity
        key={`pdf-photo-${slot}`}
        accessibilityRole="button"
        accessibilityLabel={`${photo ? 'Replace' : 'Add'} photo ${slot + 1}`}
        activeOpacity={isReadOnly ? 1 : 0.85}
        disabled={isReadOnly}
        style={styles.pdfPhotoSlot}
        onPress={() => pickPhoto(slot)}>
        {photo ? (
          <Image source={photo} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <View style={styles.pdfPhotoPlaceholder}>
            <Feather name="camera" size={46} color="#D0D0D0" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderPdfSignatureBlock = (
    target: SignatureTarget,
    label: string,
    name: string,
    strokes: SignatureStroke[],
    onNameChange: (value: string) => void,
  ) => (
    <View style={styles.pdfSignatureBlock}>
      <View style={styles.pdfSignatureNameRow}>
        <Text style={styles.pdfSignatureLabel}>{label} NAME:</Text>
        {renderPdfTextInput(name, onNameChange, {style: styles.pdfSignatureNameInput})}
      </View>
      <View style={styles.pdfSignatureSignRow}>
        <Text style={[styles.pdfSignatureLabel, {width: '50%', flexShrink: 0}]}>{label} SIGNATURE:</Text>
        <TouchableOpacity
          activeOpacity={isReadOnly ? 1 : 0.85}
          disabled={isReadOnly}
          accessibilityRole="button"
          accessibilityLabel={`${label} signature`}
          style={styles.pdfSignatureBox}
          onPress={() => openSignatureModal(target)}
          onLayout={evt => {
            const nextSize = readLayoutSize(evt);
            setSignaturePreviewSize(prev => ({...prev, [target]: nextSize}));
          }}>
          {renderSignatureStrokes(strokes, signaturePreviewSize[target].width, signaturePreviewSize[target].height)}
          {strokes.length === 0 ? <Text style={styles.pdfSignaturePlaceholder}>Tap to sign</Text> : null}
        </TouchableOpacity>
      </View>
    </View>
  );

  const initials = (user?.fullName?.trim()?.[0] ?? 'U').toUpperCase();

  const renderPhoneForm = () => (
    <View style={styles.phoneForm}>
      <View style={styles.phoneHero}>
        <Image source={company.logo} style={styles.phoneLogo} resizeMode="contain" />
        <View style={styles.phoneHeroText}>
          <Text style={styles.phoneTitle}>{companyFormTitle(company.id, 'Variation / Day Labour')}</Text>
          <View style={styles.phoneVariationRow}>
            <Text style={styles.phoneVariationLabel}>Variation No. A</Text>
            <TextInput
              style={styles.phoneVariationInput}
              editable={false}
              value={form.variationNumber || variationNumberPreview}
              keyboardType="number-pad"
            />
          </View>
        </View>
      </View>

      <View style={styles.phoneSection}>
        <Text style={styles.phoneSectionTitle}>Details</Text>
        {renderPhoneField('Form Reference Name', form.formReferenceName, value => updateField('formReferenceName', value))}
        {renderPhoneField('Client / Project Name', form.clientProjectName, value => updateField('clientProjectName', value))}
        {renderPhoneField('Date', form.date, value => updateField('date', value), {
          onPress: () => openDatePicker({type: 'formDate'}, form.date),
        })}
        {renderPhoneField('Requested By', form.requestedBy, value => updateField('requestedBy', value))}
        {renderPhoneField('Site Instruction No', form.siteInstructionNumber, value => updateField('siteInstructionNumber', value))}
        {renderPhoneField('Handover Document No', cleanHandoverNumber(form.handoverDocumentNumber), value => {
          setUserHasEdited(true);
          setForm(prev => ({
            ...prev,
            handoverDocumentNumber: sanitizeHandoverInput(value),
            handoverDocumentId: '',
            handoverDocumentTitle: '',
            drawingDocumentId: '',
            drawingDocumentType: '',
            drawingDocumentName: '',
            drawingRevisionNumber: '',
            drawingFolderId: '',
          }));
        }, {
          action: (
            <TouchableOpacity style={styles.phoneSearchButton} disabled={isReadOnly} onPress={openHandoverPicker}>
              <Feather name="search" size={15} color={Colors.primary} />
              <Text style={styles.phoneSearchButtonText}>System Search</Text>
            </TouchableOpacity>
          ),
          inputPrefix: 'No.',
          keyboardType: 'number-pad',
          linkedOnPress: form.handoverDocumentId
            ? openLinkedHandoverForm
            : form.drawingDocumentId
              ? openLinkedDrawingDocument
              : undefined,
        })}
      </View>

      <View style={styles.phoneSection}>
        <Text style={styles.phoneSectionTitle}>Information</Text>
        {renderPhoneField('Location / Level / Grid Line', form.locationLevelGridLine, value => updateField('locationLevelGridLine', value), {multiline: true})}
        {renderPhoneField('Description of Work', form.descriptionOfWork, value => updateField('descriptionOfWork', value), {multiline: true})}
        <View style={styles.phoneSubsection}>
          <Text style={styles.phoneSubsectionTitle}>Length, Width, Height, Decks & Access</Text>
          <View style={styles.phoneDimensionGrid}>
            {renderPhoneField('Length', form.scaffoldLength, value => updateField('scaffoldLength', sanitizeDecimal(value)), {
              keyboardType: 'decimal-pad',
              displayValue: isEditingScaffoldLength || !form.scaffoldLength ? form.scaffoldLength : formatMetres(form.scaffoldLength),
              onFocus: () => setIsEditingScaffoldLength(true),
              onBlur: () => setIsEditingScaffoldLength(false),
            })}
            {renderPhoneField('Width', form.scaffoldWidth, value => updateField('scaffoldWidth', sanitizeDecimal(value)), {
              keyboardType: 'decimal-pad',
              displayValue: isEditingScaffoldWidth || !form.scaffoldWidth ? form.scaffoldWidth : formatMetres(form.scaffoldWidth),
              onFocus: () => setIsEditingScaffoldWidth(true),
              onBlur: () => setIsEditingScaffoldWidth(false),
            })}
            {renderPhoneField('Height', form.scaffoldHeight, value => updateField('scaffoldHeight', sanitizeDecimal(value)), {
              keyboardType: 'decimal-pad',
              displayValue: isEditingScaffoldHeight || !form.scaffoldHeight ? form.scaffoldHeight : formatMetres(form.scaffoldHeight),
              onFocus: () => setIsEditingScaffoldHeight(true),
              onBlur: () => setIsEditingScaffoldHeight(false),
            })}
            {renderPhoneField('Decks', form.workingDecks, value => updateField('workingDecks', sanitizeDecimal(value)), {keyboardType: 'decimal-pad'})}
            {renderPhoneField('Access', form.access, value => updateField('access', value))}
          </View>
        </View>
        <View style={styles.phoneChoiceGrid}>
          {WORK_TYPE_OPTIONS.map(([key, label]) => (
            <View key={`phone-work-${key}`} style={styles.phoneChoiceGridItem}>
              {renderPhoneChoice(label, form.workTypes[key], () => {
                setUserHasEdited(true);
                setForm(prev => ({...prev, workTypes: {...prev.workTypes, [key]: !prev.workTypes[key]}}));
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.phoneSection}>
        <Text style={styles.phoneSectionTitle}>Labour</Text>
        {form.labourRows.map((row, index) => (
          <View key={`phone-labour-${index}`} style={styles.phoneLabourRow}>
            <View style={styles.phoneLabourHeader}>
              <Text style={styles.phoneLabourTitle}>Labour Row {index + 1}</Text>
              {form.labourRows.length > 1 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Remove labour row ${index + 1}`}
                  style={styles.phoneRemoveButton}
                  disabled={isReadOnly}
                  onPress={() => removeLabourRow(index)}>
                  <Feather name="minus" size={16} color="#B42318" />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.phoneLabourGrid}>
              {renderPhoneField('Date', row.date, value => updateLabourRow(index, 'date', value), {
                onPress: () => openDatePicker({type: 'labourDate', index}, row.date),
              })}
              {renderPhoneField('Men', row.men, value => updateLabourRow(index, 'men', value), {keyboardType: 'decimal-pad'})}
              {renderPhoneField('Hours', row.hours, value => updateLabourRow(index, 'hours', value), {keyboardType: 'decimal-pad'})}
              <View style={styles.phoneField}>
                <Text style={styles.phoneFieldLabel}>Total</Text>
                <TextInput style={[styles.phoneInput, styles.phoneTotalInput]} editable={false} value={row.total} />
              </View>
            </View>
          </View>
        ))}
        {form.labourRows.length < 4 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Add labour row"
            style={styles.phoneAddRowButton}
            disabled={isReadOnly}
            onPress={addLabourRow}>
            <Feather name="plus" size={17} color="#111111" />
            <Text style={styles.phoneAddRowText}>Add labour row</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.phoneSection}>
        <Text style={styles.phoneSectionTitle}>Transport & Materials</Text>
        {renderPhoneField('Transport Included', form.transportIncluded, value => updateField('transportIncluded', value))}
        <Text style={styles.phoneSubsectionTitle}>Engineer Required</Text>
        <View style={styles.phoneChoiceGrid}>
          <View style={styles.phoneChoiceGridItem}>
            {renderPhoneChoice('Yes', form.engineerRequired === true, () => updateField('engineerRequired', form.engineerRequired === true ? null : true))}
          </View>
          <View style={styles.phoneChoiceGridItem}>
            {renderPhoneChoice('No', form.engineerRequired === false, () => updateField('engineerRequired', form.engineerRequired === false ? null : false))}
          </View>
        </View>
        <Text style={styles.phoneSubsectionTitle}>Additional Material Used</Text>
        {manualMaterialEntryEnabled ? (
          <TextInput
            accessibilityLabel="Enter materials manually"
            style={[styles.phoneMaterialListBox, styles.phoneMaterialManualInput]}
            editable={!isReadOnly}
            multiline
            value={form.materialList}
            onChangeText={updateManualMaterialList}
            placeholder="Enter materials manually"
            placeholderTextColor={theme.textSecondary}
          />
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Add material"
            activeOpacity={0.8}
            disabled={isReadOnly}
            style={[styles.phoneMaterialListBox, form.materialList.trim() ? styles.materialSelectionBoxFilled : null]}
            onPress={openMaterialSelection}>
            {form.materialList.trim() ? (
              renderMaterialListGrid(styles.phoneMaterialListText)
            ) : (
              <View style={styles.materialPlaceholder}>
                <Feather name="plus-circle" size={26} color={theme.textSecondary} />
                <Text style={styles.materialPlaceholderText}>Add material</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.phoneSection}>
        <Text style={styles.phoneSectionTitle}>Site Photos</Text>
        <View style={styles.phonePhotoGrid}>
          {PHOTO_SLOTS.map(renderPhonePhotoSlot)}
        </View>
      </View>

      <View style={styles.phoneSection}>
        <Text style={styles.phoneSectionTitle}>Signatures</Text>
        {renderPhoneSignatureBlock('ess', 'ESS Representative', form.essRepresentativeName, form.essRepresentativeSignatureStrokes, value => updateField('essRepresentativeName', value))}
        {renderPhoneSignatureBlock('client', 'Client', form.clientName, form.clientSignatureStrokes, value => updateField('clientName', value))}
      </View>

      {hasUnsavedChanges ? (
        <TouchableOpacity style={[styles.phoneSaveButton, saving ? styles.saveButtonDisabled : null]} disabled={saving} onPress={handleSave}>
          {saving ? <ActivityIndicator size="small" color="#111827" /> : <Text style={styles.phoneSaveButtonText}>Save Changes</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderZoomableDocument = (document: React.ReactNode) => {
    if (!usesIOSDocumentEditor) {
      return document;
    }

    const availableWidth = Math.max(1, documentPagerWidth || width);
    // Keep the rendered page at its established inset fit while allowing the
    // interactive pan/zoom surface to occupy the full measured container.
    const pageFitWidth = Math.max(1, availableWidth - 32);
    const availableHeight = Math.max(
      180,
      documentPagerHeight || height - insets.top - insets.bottom - 112,
    );
    const visibleHeight = Math.max(
      180,
      availableHeight - 64 - insets.bottom,
    );
    const pageSlotContentHeight = Math.max(180, visibleHeight - 24);
    const pageHeightForFit = Math.max(
      documentPageHeight,
      IOS_DOCUMENT_PAGE_MAX_CONTENT_HEIGHT,
    ) + IOS_DOCUMENT_PAGE_CANVAS_GUTTER;
    const pageFitScale = Math.min(
      pageFitWidth / IOS_DOCUMENT_PAGE_WIDTH,
      pageSlotContentHeight / pageHeightForFit,
    );
    const fittedPageWidth = IOS_DOCUMENT_PAGE_WIDTH * pageFitScale;
    const fittedPageHeight = documentPageHeight * pageFitScale;
    const fittedCanvasStyle = {width: fittedPageWidth, height: fittedPageHeight};
    // Expand only the pan/zoom viewport. centerContent keeps the fitted form
    // canvas at the exact same scale and initial position inside it.
    const viewportStyle = {width: availableWidth, height: visibleHeight};

    return (
      <View style={[styles.iOSDocumentPageSlot, {height: availableHeight}]}>
        <ScrollView
          key={`day-labour-document-${availableWidth}-${documentPageHeight}`}
          testID="ess-day-labour-stable-scroll-page"
          style={[
            styles.iOSDocumentPageViewport,
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
          <View style={[styles.iOSDocumentPageFitCanvas, fittedCanvasStyle]}>
            <View
              style={[
                styles.iOSDocumentPageCanvas,
                {
                  width: IOS_DOCUMENT_PAGE_WIDTH,
                  height: documentPageHeight,
                  transform: [{scale: pageFitScale}],
                },
              ]}>
              <View
                style={styles.iOSDocumentPageSource}
                onLayout={event => {
                  const nextHeight = Math.max(
                    IOS_DOCUMENT_PAGE_MAX_CONTENT_HEIGHT,
                    event.nativeEvent.layout.height,
                  );
                  if (nextHeight > 0 && Math.abs(nextHeight - documentPageHeight) > 1) {
                    setDocumentPageHeight(nextHeight);
                  }
                }}>
                {document}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={prefs.themeMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />
      <View style={{paddingTop: insets.top, backgroundColor: theme.card}}>
        <AppTopBar
          theme={theme}
          isDarkMode={prefs.themeMode === 'dark'}
          showMenu={false}
          onPressMenu={() => setShowDrawer(true)}
          onPressBack={() => {
            if (hasUnsavedChanges) {
              Alert.alert('Discard changes?', 'Leave without saving this form?', [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Discard', style: 'destructive', onPress: () => navigation.goBack()},
              ]);
              return;
            }
            navigation.goBack();
          }}
          centerContent={
            <CompanyEntitySelector
              entityId={form.companyEntityId}
              formName="Variation / Day Labour"
              theme={theme}
              disabled={isReadOnly}
              onChange={entityId => {
                companySelectionTouchedRef.current = true;
                setUserHasEdited(true);
                setForm(previous => ({...previous, companyEntityId: entityId}));
              }}
            />
          }
          rightContent={
            usesIOSDocumentEditor ? (
              hasUnsavedChanges ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Save day labour form"
                  activeOpacity={0.86}
                  style={styles.iOSHeaderSaveButton}
                  disabled={saving}
                  onPress={handleSave}>
                  {saving
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.iOSHeaderSaveText}>Save</Text>}
                </TouchableOpacity>
              ) : formId && !loading ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Share day labour form"
                  activeOpacity={0.86}
                  style={styles.iOSHeaderShareButton}
                  disabled={openingShare}
                  onPress={handleShare}>
                  {openingShare
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Text style={styles.iOSHeaderShareText}>Share</Text>}
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

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          testID={usesIOSDocumentEditor ? 'ess-day-labour-stable-scroll-pager' : undefined}
          style={[styles.content, usesIOSDocumentEditor ? styles.iOSDocumentPager : null]}
          contentContainerStyle={usesIOSDocumentEditor ? styles.iOSDocumentPagerContent : styles.contentInner}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!usesIOSDocumentEditor}
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustKeyboardInsets={false}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={!usesIOSDocumentEditor}
          showsHorizontalScrollIndicator={false}
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
          }}>
          {isPhoneLayout ? renderPhoneForm() : renderZoomableDocument(
          <View style={[styles.pdfPage, usesIOSDocumentEditor ? styles.iOSDocumentPdfPage : null]}>
            <View style={styles.pdfHeader}>
              <View style={styles.pdfBrand}>
                <Image source={company.logo} style={styles.pdfLogo} resizeMode="contain" />
                <View style={styles.pdfCompanyBlock}>
                  <Text style={styles.pdfCompanyText}>{company.legalName}</Text>
                  <Text style={styles.pdfCompanyText}>ABN: {company.abn}</Text>
                  <Text style={styles.pdfCompanyText}>Office Address: {company.officeAddress}</Text>
                  <Text style={styles.pdfCompanyText}>PH: {company.phone}   FAX: {company.fax}</Text>
                </View>
              </View>
              <View style={styles.pdfTitleBlock}>
                <Text style={styles.pdfTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {companyFormTitle(company.id, 'Variation / Day Labour')}
                </Text>
                <View style={styles.variationRow}>
                  <Text style={styles.variationLabel}>VARIATION NO. A</Text>
                  {renderPdfTextInput(form.variationNumber || variationNumberPreview, () => {}, {
                    style: styles.variationInput,
                    keyboardType: 'number-pad',
                    editable: false,
                  })}
                </View>
              </View>
            </View>

            <View style={styles.topDivider} />

            <View style={styles.pdfMetaFullWidthRows}>
              {renderUnderlineField('FORM REFERENCE NAME', form.formReferenceName, value => updateField('formReferenceName', value), {wide: true})}
              {renderUnderlineField('CLIENT / PROJECT NAME', form.clientProjectName, value => updateField('clientProjectName', value), {wide: true})}
              {renderUnderlineField('HANDOVER DOCUMENT NO', cleanHandoverNumber(form.handoverDocumentNumber), value => {
                setUserHasEdited(true);
                setForm(prev => ({
                  ...prev,
                  handoverDocumentNumber: sanitizeHandoverInput(value),
                  handoverDocumentId: '',
                  handoverDocumentTitle: '',
                  drawingDocumentId: '',
                  drawingDocumentType: '',
                  drawingDocumentName: '',
                  drawingRevisionNumber: '',
                  drawingFolderId: '',
                }));
              }, {
                wide: true,
                leftAction: (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Search handover documents"
                    style={styles.systemSearchButton}
                    disabled={isReadOnly}
                    onPress={openHandoverPicker}>
                    <Feather name="search" size={13} color={Colors.primary} />
                    <Text style={styles.systemSearchButtonText}>System Search</Text>
                  </TouchableOpacity>
                ),
                inputPrefix: 'No.',
                keyboardType: 'number-pad',
                linkedOnPress: form.handoverDocumentId
                  ? openLinkedHandoverForm
                  : form.drawingDocumentId
                    ? openLinkedDrawingDocument
                    : undefined,
              })}
              {renderUnderlineField('SITE INSTRUCTION NO', form.siteInstructionNumber, value => updateField('siteInstructionNumber', value), {wide: true})}
            </View>
            <View style={styles.pdfMetaRows}>
              <View style={styles.pdfMetaColumn}>
                {renderUnderlineField('DATE', form.date, value => updateField('date', value), {
                  wide: true,
                  onPress: () => openDatePicker({type: 'formDate'}, form.date),
                })}
              </View>
              <View style={styles.pdfMetaColumn}>
                {renderUnderlineField('REQUESTED BY', form.requestedBy, value => updateField('requestedBy', value), {wide: true})}
              </View>
            </View>

            <View style={styles.pdfBand}>
              <Text style={styles.pdfBandText}>INFORMATION</Text>
            </View>

            <View style={styles.infoBlock}>
              <View style={styles.infoLeft}>
                <Text style={styles.pdfFieldLabel}>LOCATION / LEVEL / GRID LINE:</Text>
                {renderPdfTextInput(form.locationLevelGridLine, value => updateField('locationLevelGridLine', value), {
                  style: styles.locationBox,
                  multiline: true,
                })}
                <Text style={styles.pdfFieldLabel}>DESCRIPTION OF WORK:</Text>
                {renderPdfTextInput(form.descriptionOfWork, value => updateField('descriptionOfWork', value), {
                  style: styles.descriptionBox,
                  multiline: true,
                })}
              </View>
              <View style={styles.infoRight}>
                <Text style={styles.dimensionTitle}>{'LENGTH, WIDTH, HEIGHT\nDECKS & ACCESS'}</Text>
                <View style={styles.dimensionList}>
                  {renderDimensionLine('L', form.scaffoldLength, value => updateField('scaffoldLength', sanitizeDecimal(value)), 'decimal-pad', undefined, {
                    displayValue: isEditingScaffoldLength || !form.scaffoldLength ? form.scaffoldLength : formatMetres(form.scaffoldLength),
                    onFocus: () => setIsEditingScaffoldLength(true),
                    onBlur: () => setIsEditingScaffoldLength(false),
                  })}
                  {renderDimensionLine('W', form.scaffoldWidth, value => updateField('scaffoldWidth', sanitizeDecimal(value)), 'decimal-pad', undefined, {
                    displayValue: isEditingScaffoldWidth || !form.scaffoldWidth ? form.scaffoldWidth : formatMetres(form.scaffoldWidth),
                    onFocus: () => setIsEditingScaffoldWidth(true),
                    onBlur: () => setIsEditingScaffoldWidth(false),
                  })}
                  {renderDimensionLine('H', form.scaffoldHeight, value => updateField('scaffoldHeight', sanitizeDecimal(value)), 'decimal-pad', undefined, {
                    displayValue: isEditingScaffoldHeight || !form.scaffoldHeight ? form.scaffoldHeight : formatMetres(form.scaffoldHeight),
                    onFocus: () => setIsEditingScaffoldHeight(true),
                    onBlur: () => setIsEditingScaffoldHeight(false),
                  })}
                  {renderDimensionLine('D', form.workingDecks, value => updateField('workingDecks', sanitizeDecimal(value)))}
                  {renderDimensionLine('A', form.access, value => updateField('access', value), 'default')}
                </View>
                <Text style={styles.pleaseTickText}>(please tick)</Text>
                <View style={styles.workTypeList}>
                  {WORK_TYPE_OPTIONS.map(([key, label]) => (
                    <View key={key} style={styles.workTypeRow}>
                      <Text style={styles.workTypeLabel}>{label.toUpperCase()}:</Text>
                      {renderTickBox(form.workTypes[key], () => {
                        setUserHasEdited(true);
                        setForm(prev => ({...prev, workTypes: {...prev.workTypes, [key]: !prev.workTypes[key]}}));
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.labourTable}>
              {form.labourRows.map((row, index) => (
                <View key={`labour-${index}`} style={[styles.labourPdfRow, index < 2 ? styles.labourPdfRowTint : null]}>
                  <View style={styles.labourPdfField}>
                    <Text style={styles.labourPdfLabel}>DATE:</Text>
                    {renderPdfTextInput(row.date, value => updateLabourRow(index, 'date', value), {
                      style: styles.labourPdfInput,
                      onPress: () => openDatePicker({type: 'labourDate', index}, row.date),
                      pressableTextStyle: styles.labourPressableText,
                    })}
                  </View>
                  <View style={styles.labourPdfFieldSmall}>
                    <Text style={styles.labourPdfLabel}>MEN:</Text>
                    {renderPdfTextInput(row.men, value => updateLabourRow(index, 'men', value), {style: styles.labourPdfInputSmall, keyboardType: 'decimal-pad'})}
                  </View>
                  <Text style={styles.labourPdfLabel}>X</Text>
                  <View style={styles.labourPdfFieldSmall}>
                    <Text style={styles.labourPdfLabel}>HOURS:</Text>
                    {renderPdfTextInput(row.hours, value => updateLabourRow(index, 'hours', value), {style: styles.labourPdfInputSmall, keyboardType: 'decimal-pad'})}
                  </View>
                  <Text style={styles.labourPdfLabel}>=</Text>
                  <View style={styles.labourPdfFieldSmall}>
                    <Text style={styles.labourPdfLabel}>TOTAL:</Text>
                    <TextInput
                      style={styles.labourTotalValue}
                      editable={false}
                      value={row.total}
                      numberOfLines={1}
                    />
                  </View>
                  {form.labourRows.length > 1 ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Remove labour row ${index + 1}`}
                      style={styles.removeLabourButton}
                      disabled={isReadOnly}
                      onPress={() => removeLabourRow(index)}>
                      <Feather name="minus" size={13} color="#B42318" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
              {form.labourRows.length < 4 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Add labour row"
                  style={styles.addLabourRow}
                  disabled={isReadOnly}
                  onPress={addLabourRow}>
                  <Feather name="plus" size={15} color="#111111" />
                  <Text style={styles.addLabourRowText}>Add labour row</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.transportRow}>
              <View style={styles.transportLeftGroup}>
                <Text style={styles.transportLabel}>TRANSPORT INCLUDED :</Text>
                {renderPdfTextInput(form.transportIncluded, value => updateField('transportIncluded', value), {style: styles.transportInput})}
              </View>
              <View style={styles.transportEngineerGroup}>
                <Text style={styles.transportLabel}>ENGINEER REQUIRED</Text>
                <Text style={styles.pleaseTickInline}>(please tick):</Text>
                <Text style={styles.transportOptionLabel}>YES</Text>
                {renderTickBox(form.engineerRequired === true, () => updateField('engineerRequired', form.engineerRequired === true ? null : true), 'sm')}
                <Text style={styles.transportOptionLabel}>NO</Text>
                {renderTickBox(form.engineerRequired === false, () => updateField('engineerRequired', form.engineerRequired === false ? null : false), 'sm')}
              </View>
            </View>

            <View style={styles.materialHeader}>
              <Text style={styles.materialLabel}>ADDITIONAL MATERIAL USED</Text>
            </View>
            {manualMaterialEntryEnabled ? (
              <TextInput
                accessibilityLabel="Enter materials manually"
                style={[styles.materialBox, styles.materialManualInput]}
                editable={!isReadOnly}
                multiline
                value={form.materialList}
                onChangeText={updateManualMaterialList}
                placeholder="Enter materials manually"
                placeholderTextColor="#777777"
              />
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add material"
                activeOpacity={0.8}
                disabled={isReadOnly}
                style={[styles.materialBox, styles.materialSelectionBox, form.materialList.trim() ? styles.materialSelectionBoxFilled : null]}
                onPress={openMaterialSelection}>
                {form.materialList.trim() ? (
                  renderMaterialListGrid(styles.materialListText)
                ) : (
                  <View style={styles.materialPlaceholder}>
                    <Feather name="plus-circle" size={isWide ? 28 : 21} color="#B7B7B7" />
                    <Text style={styles.materialPlaceholderText}>Add material</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.pdfBand}>
              <Text style={styles.pdfBandText}>SITE PHOTOS</Text>
            </View>
            <View style={styles.pdfPhotoRow}>
              {PHOTO_SLOTS.map(renderPhotoPdfSlot)}
            </View>

            <View style={styles.pdfSignatureGrid}>
              {renderPdfSignatureBlock('ess', representativeLabel, form.essRepresentativeName, form.essRepresentativeSignatureStrokes, value => updateField('essRepresentativeName', value))}
              {renderPdfSignatureBlock('client', 'CLIENT', form.clientName, form.clientSignatureStrokes, value => updateField('clientName', value))}
            </View>

            {!usesIOSDocumentEditor && hasUnsavedChanges ? (
              <View style={styles.formPageSaveArea}>
                <TouchableOpacity style={[styles.saveButton, saving ? styles.saveButtonDisabled : null]} disabled={saving} onPress={handleSave}>
                  {saving ? <ActivityIndicator size="small" color="#111827" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>,
          )}
        </ScrollView>
      )}

      <Modal visible={showMaterialPicker} transparent animationType="fade" onRequestClose={closeMaterialSelection}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close material picker"
            style={styles.modalBackdropPress}
            onPress={closeMaterialSelection}
          />
          <View style={styles.materialPickerModal}>
            <View style={styles.materialPickerHeader}>
              <View>
                <Text style={styles.materialPickerTitle}>Additional Materials</Text>
                <Text style={styles.materialPickerSubtitle}>Search components and enter quantities.</Text>
              </View>
              <TouchableOpacity style={styles.iconButton} onPress={closeMaterialSelection}>
                <Feather name="x" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.materialPickerSearchRow}>
              <Feather name="search" size={18} color={theme.textSecondary} />
              <TextInput
                value={materialSearchText}
                onChangeText={setMaterialSearchText}
                placeholder="Search scaffold components"
                placeholderTextColor={theme.textSecondary}
                style={styles.materialPickerSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {materialSearchText ? (
                <TouchableOpacity onPress={() => setMaterialSearchText('')}>
                  <Feather name="x" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.materialPickerColumnHeader}>
              <Text style={styles.materialPickerColumnTitle}>Component</Text>
              <Text style={styles.materialPickerQtyTitle}>Qty</Text>
            </View>
            <FlatList
              data={filteredMaterialItems}
              keyExtractor={item => item.key}
              style={styles.materialPickerList}
              contentContainerStyle={styles.materialPickerListContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              renderItem={({item}) => {
                if (item.section) {
                  return (
                    <View style={styles.materialPickerSectionRow}>
                      <Text style={styles.materialPickerSectionText}>{item.label}</Text>
                    </View>
                  );
                }

                const key = materialQuantityKey(item.rowId, item.side);
                return (
                  <View style={styles.materialPickerRow}>
                    <View style={styles.materialPickerItemTextWrap}>
                      <Text style={styles.materialPickerItemLabel}>{item.label}</Text>
                      {item.spec ? <Text style={styles.materialPickerItemSpec}>{item.spec}</Text> : null}
                    </View>
                    <TextInput
                      value={materialDraftValues[key] ?? ''}
                      onChangeText={value => updateMaterialDraftQuantity(key, value)}
                      style={styles.materialPickerQtyInput}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>
                );
              }}
            />
            <View style={styles.materialPickerFooter}>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeMaterialSelection}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={saveMaterialSelection}>
                <Text style={styles.primaryButtonText}>Save materials</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDatePicker(false);
          setDatePickerTarget(null);
        }}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setShowDatePicker(false);
            setDatePickerTarget(null);
          }}>
          <Pressable style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                <Feather name="chevron-left" size={20} color={theme.text} />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>
                {calendarMonth.toLocaleString(undefined, {month: 'long', year: 'numeric'})}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                <Feather name="chevron-right" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text key={`weekday-${day}-${index}`} style={styles.calendarWeekDay}>{day}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {renderCalendarDays().map((day, index) => (
                <TouchableOpacity
                  key={`day-${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}-${index}`}
                  style={[styles.calendarDayCell, day == null ? styles.calendarDayCellEmpty : null]}
                  disabled={day == null}
                  onPress={() => {
                    if (day == null) {
                      return;
                    }
                    applyPickedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                  }}>
                  <Text style={styles.calendarDayText}>{day ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <SignaturePadModal
        visible={showSignatureModal}
        title={signatureTarget === 'ess' ? 'ESS Signature' : 'Client Signature'}
        initialStrokes={signatureTarget === 'ess'
          ? form.essRepresentativeSignatureStrokes
          : form.clientSignatureStrokes}
        onApply={applySignature}
        onClose={() => setShowSignatureModal(false)}
      />

      <Modal visible={showHandoverPicker} transparent animationType="slide" onRequestClose={() => setShowHandoverPicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowHandoverPicker(false)}>
          <Pressable style={styles.drawingRegisterCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Handover Form</Text>
              <TouchableOpacity style={styles.iconButton} onPress={() => setShowHandoverPicker(false)}>
                <Feather name="x" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
            {handoverPickerError ? <Text style={styles.errorText}>{handoverPickerError}</Text> : null}
            {handoverPickerLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
            <FlatList
              data={handoverPickerItems}
              keyExtractor={item => item.id}
              style={styles.drawingRegisterList}
              ListEmptyComponent={handoverPickerLoading ? null : <Text style={styles.emptyRegisterText}>No handover certificates created for this site yet.</Text>}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.drawingRegisterItem} onPress={() => selectHandoverForm(item)}>
                  <Feather name="file-text" size={20} color={Colors.primary} />
                  <View style={styles.drawingRegisterItemText}>
                    <Text style={styles.drawingRegisterItemTitle} numberOfLines={1}>
                      {item.formReferenceName || 'Handover Certificate'}
                    </Text>
                    <Text style={styles.drawingRegisterItemPath} numberOfLines={1}>
                      {[item.inspectionDateTime, item.essRepresentativeName].filter(Boolean).join('  |  ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDrawingRegister} transparent animationType="slide" onRequestClose={() => setShowDrawingRegister(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDrawingRegister(false)}>
          <Pressable style={styles.drawingRegisterCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ESS Design Register</Text>
              <TouchableOpacity style={styles.iconButton} onPress={() => setShowDrawingRegister(false)}>
                <Feather name="x" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.drawingBreadcrumbRow}>
              <TouchableOpacity style={styles.breadcrumbButton} disabled={drawingRegisterLoading} onPress={() => loadDrawingRegisterRoot()}>
                <Text style={styles.breadcrumbText}>Root</Text>
              </TouchableOpacity>
              {drawingBreadcrumbs.map(crumb => (
                <TouchableOpacity key={crumb.id} style={styles.breadcrumbButton} disabled={drawingRegisterLoading} onPress={() => openDrawingFolder(crumb.id)}>
                  <Text style={styles.breadcrumbText} numberOfLines={1}>{crumb.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {drawingRegisterError ? <Text style={styles.errorText}>{drawingRegisterError}</Text> : null}
            {drawingRegisterLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
            <FlatList
              data={drawingBrowserItems}
              keyExtractor={item => `${item.type}-${item.data.id}`}
              style={styles.drawingRegisterList}
              ListEmptyComponent={drawingRegisterLoading ? null : <Text style={styles.emptyRegisterText}>No folders or PDFs in this location.</Text>}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.drawingRegisterItem}
                  onPress={() => {
                    if (item.type === 'folder') {
                      openDrawingFolder(item.data.id).catch(() => {
                        // handled in openDrawingFolder
                      });
                    } else {
                      selectDrawingRegisterDocument(item.data);
                    }
                  }}>
                  <Feather name={item.type === 'folder' ? 'folder' : 'file-text'} size={20} color={item.type === 'folder' ? Colors.primaryDark : Colors.primary} />
                  <View style={styles.drawingRegisterItemText}>
                    <Text style={styles.drawingRegisterItemTitle} numberOfLines={1}>{item.type === 'folder' ? item.data.name : getDocumentDisplayName(item.data)}</Text>
                    <Text style={styles.drawingRegisterItemPath} numberOfLines={1}>{item.type === 'folder' ? 'Folder' : 'PDF document'}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <ProjectDataFormShareModal
        visible={showShareModal}
        theme={theme}
        title={form.formReferenceName || form.variationNumber || 'Day Labour/Variation'}
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
        variant="day-labour"
        formNumber={form.variationNumber || variationNumberPreview}
        referenceName={form.formReferenceName}
        representativeName={form.essRepresentativeName}
        showDontShowAgain
        onDontShowAgain={dismissWorkflowDemoPermanently}
        onClose={() => setShowWorkflowDemo(false)}
      />

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
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof getTheme>, isWide: boolean, isPhoneLayout: boolean) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: theme.background},
    centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    content: {flex: 1},
    contentInner: {padding: isPhoneLayout ? 12 : isWide ? Spacing.lg : 10, paddingBottom: 120, gap: 14, alignItems: 'center'},
    iOSDocumentPager: {
      backgroundColor: '#FFFFFF',
    },
    iOSDocumentPagerContent: {
      flexGrow: 1,
      padding: 0,
      backgroundColor: '#FFFFFF',
    },
    iOSDocumentPageSlot: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-start',
      backgroundColor: '#FFFFFF',
    },
    iOSDocumentPageViewport: {
      flexGrow: 0,
      flexShrink: 0,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    iOSDocumentPageFitCanvas: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    iOSDocumentPageCanvas: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      transformOrigin: 'top left',
    },
    iOSDocumentPageSource: {
      width: IOS_DOCUMENT_PAGE_WIDTH,
      minHeight: IOS_DOCUMENT_PAGE_MAX_CONTENT_HEIGHT,
      backgroundColor: '#FFFFFF',
    },
    iOSDocumentPdfPage: {minHeight: IOS_DOCUMENT_PAGE_MAX_CONTENT_HEIGHT},
    phoneForm: {width: '100%', gap: 12},
    phoneHero: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#D0D0D0',
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    phoneLogo: {width: 82, height: 42},
    phoneHeroText: {flex: 1, minWidth: 0, gap: 8, alignItems: 'flex-end'},
    phoneTitle: {fontSize: 18, lineHeight: 22, color: '#000000', fontWeight: '900', textAlign: 'right'},
    phoneVariationRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
    phoneVariationLabel: {fontSize: 12, lineHeight: 15, color: '#F01818', fontWeight: '900', textTransform: 'uppercase'},
    phoneVariationInput: {
      width: 68,
      height: 34,
      borderWidth: 2,
      borderColor: '#F01818',
      color: '#333333',
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '800',
      paddingHorizontal: 4,
      paddingVertical: 0,
      backgroundColor: '#FFFFFF',
    },
    phoneSection: {
      width: '100%',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#222222',
      padding: 12,
      gap: 12,
    },
    phoneSectionTitle: {
      marginHorizontal: -12,
      marginTop: -12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: '#F18B20',
      color: '#000000',
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '900',
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    phoneSubsection: {gap: 10},
    phoneSubsectionTitle: {fontSize: 13, lineHeight: 17, color: '#111111', fontWeight: '900', textTransform: 'uppercase'},
    phoneField: {gap: 6},
    phoneFieldHeader: {minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
    phoneFieldLabel: {fontSize: 12, lineHeight: 16, color: '#111111', fontWeight: '900', textTransform: 'uppercase'},
    phoneInput: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      color: '#222222',
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 10,
      paddingVertical: 8,
      textAlignVertical: 'center',
    },
    phoneInputPrefixRow: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      gap: 7,
    },
    phoneInputPrefix: {color: '#111111', fontSize: 15, lineHeight: 20, fontWeight: '900'},
    phoneInputSuffix: {color: '#111111', fontSize: 15, lineHeight: 20, fontWeight: '900'},
    phoneInputWithPrefix: {
      flex: 1,
      minWidth: 0,
      minHeight: 42,
      color: '#222222',
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: 'transparent',
      textAlignVertical: 'center',
    },
    phoneInputMultiline: {minHeight: 112, textAlignVertical: 'top'},
    phoneMaterialListBox: {
      minHeight: 116,
      borderWidth: 1,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      padding: 10,
      justifyContent: 'center',
    },
    phoneMaterialListText: {
      color: '#222222',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      textAlign: 'left',
    },
    phoneMaterialManualInput: {
      color: '#222222',
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      textAlignVertical: 'top',
      justifyContent: 'flex-start',
    },
    phonePressableField: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    phonePressableFieldText: {flex: 1, minWidth: 0, color: '#222222', fontSize: 15, lineHeight: 20, fontWeight: '700'},
    phoneLinkedField: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: '#F2F7FF',
      paddingHorizontal: 10,
      justifyContent: 'center',
    },
    phoneLinkedFieldText: {color: Colors.primary, fontSize: 15, lineHeight: 20, fontWeight: '800'},
    phoneLinkedEditField: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    phoneLinkedTextButton: {
      minHeight: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: '#F2F7FF',
      paddingHorizontal: 10,
      justifyContent: 'center',
      flexShrink: 0,
    },
    phoneLinkedEditInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 42,
      color: '#222222',
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: 'transparent',
      textAlignVertical: 'center',
    },
    phoneSearchButton: {
      minHeight: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: '#F2F7FF',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    phoneSearchButtonText: {fontSize: 11, lineHeight: 14, fontWeight: '900', color: Colors.primary},
    phoneDimensionGrid: {gap: 10},
    phoneChoiceGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
    phoneChoiceGridItem: {flexBasis: '48%', flexGrow: 1, minWidth: 136},
    phoneChoice: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    phoneChoiceActive: {borderColor: Colors.primary, backgroundColor: '#F2F7FF'},
    phoneChoiceBox: {width: 24, height: 24, borderWidth: 1.5, borderColor: '#333333', backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center'},
    phoneChoiceBoxActive: {borderColor: Colors.primary, backgroundColor: Colors.primary},
    phoneChoiceText: {flex: 1, minWidth: 0, color: '#111111', fontSize: 13, lineHeight: 17, fontWeight: '800'},
    phoneChoiceTextActive: {color: Colors.primaryDark},
    phoneLabourRow: {borderWidth: 1, borderColor: '#222222', backgroundColor: '#F8E0C8', padding: 10, gap: 10},
    phoneLabourHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
    phoneLabourTitle: {fontSize: 13, lineHeight: 17, color: '#111111', fontWeight: '900', textTransform: 'uppercase'},
    phoneRemoveButton: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
    phoneLabourGrid: {gap: 10},
    phoneTotalInput: {borderColor: '#F01818', borderWidth: 2, textAlign: 'center', fontWeight: '900', backgroundColor: '#FFF7ED'},
    phoneAddRowButton: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: '#222222',
      backgroundColor: '#F4F4F4',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    phoneAddRowText: {fontSize: 13, lineHeight: 17, color: '#111111', fontWeight: '900'},
    phonePhotoGrid: {flexDirection: 'row', gap: 8},
    phonePhotoSlot: {
      flex: 1,
      aspectRatio: 0.86,
      borderWidth: 1,
      borderColor: '#222222',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    phonePhotoPlaceholder: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF'},
    phoneSignatureBlock: {gap: 10},
    phoneSignatureBox: {
      height: 116,
      borderWidth: 1.2,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    phoneSignaturePlaceholder: {fontSize: 13, color: '#999999', fontWeight: '700', textAlign: 'center'},
    phoneSaveButton: {
      minHeight: 48,
      backgroundColor: '#F18B20',
      borderWidth: 1,
      borderColor: '#C96808',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    phoneSaveButtonText: {fontSize: 15, lineHeight: 19, color: '#111111', fontWeight: '900'},
    pdfPage: {
      width: '100%',
      maxWidth: 920,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: isWide ? 22 : 10,
      paddingTop: 24,
      paddingBottom: isWide ? 76 : 66,
      borderWidth: 1,
      borderColor: '#D0D0D0',
      position: 'relative',
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 6},
      elevation: 3,
    },
    pdfHeader: {
      minHeight: 82,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    pdfBrand: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10},
    pdfLogo: {width: isWide ? 126 : 92, height: isWide ? 60 : 48},
    pdfCompanyBlock: {flex: 1, minWidth: 0},
    pdfCompanyText: {fontSize: isWide ? 12 : 9, lineHeight: isWide ? 15 : 12, color: '#222222', fontWeight: '500'},
    pdfTitleBlock: {width: isWide ? 340 : 210, alignItems: 'flex-end', justifyContent: 'center', gap: 12},
    pdfTitle: {width: '100%', fontSize: isWide ? 20 : 16, lineHeight: isWide ? 30 : 19, color: '#000000', fontWeight: '900', textAlign: 'right'},
    variationRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
    variationLabel: {fontSize: isWide ? 17 : 11.5, lineHeight: isWide ? 21 : 14, color: '#F01818', fontWeight: '900', textAlignVertical: 'center'},
    variationInput: {
      width: isWide ? 72 : 58,
      height: isWide ? 34 : 30,
      borderWidth: 2,
      borderColor: '#F01818',
      color: '#333333',
      textAlign: 'center',
      fontSize: isWide ? 14 : 11,
      lineHeight: isWide ? 16 : 13,
      fontWeight: '700',
      paddingHorizontal: 4,
      paddingVertical: 0,
    },
    topDivider: {height: 1, backgroundColor: '#7A7A7A', marginBottom: 12},
    pdfMetaFullWidthRows: {width: '100%', gap: 5, marginBottom: 5},
    pdfMetaRows: {flexDirection: isWide ? 'row' : 'column', gap: isWide ? 26 : 2, marginBottom: 8},
    pdfMetaColumn: {flex: 1, gap: 5},
    underlineField: {height: isWide ? 27 : 25, flexDirection: 'row', alignItems: 'center', gap: 4},
    underlineFieldWide: {width: '100%'},
    underlineLabel: {fontSize: isWide ? 14 : 10.5, lineHeight: isWide ? 18 : 14, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    underlineInputWrap: {flex: 1, minWidth: 0, height: isWide ? 27 : 25, borderBottomWidth: 1, borderBottomColor: '#777777', justifyContent: 'center'},
    underlineInput: {
      height: isWide ? 27 : 25,
      color: '#222222',
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 18 : 14,
      paddingHorizontal: 2,
      paddingVertical: 0,
      paddingRight: 58,
      backgroundColor: 'transparent',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    underlineInputPrefixRow: {
      flex: 1,
      minWidth: 0,
      height: isWide ? 27 : 25,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    underlineInputPrefix: {
      color: '#111111',
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 18 : 14,
      fontWeight: '900',
      includeFontPadding: false,
    },
    underlineInputSuffix: {
      color: '#111111',
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 18 : 14,
      fontWeight: '900',
      includeFontPadding: false,
    },
    underlineInputWithPrefix: {
      flex: 1,
      minWidth: 0,
      paddingRight: 0,
    },
    underlinePressableText: {fontSize: isWide ? 13 : 10.5, lineHeight: isWide ? 18 : 14, fontWeight: '700'},
    linkedUnderlineInput: {
      height: isWide ? 27 : 25,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: isWide ? 5 : 3,
      paddingHorizontal: 2,
      backgroundColor: 'transparent',
    },
    linkedUnderlineEditRow: {
      flex: 1,
      minWidth: 0,
      height: isWide ? 27 : 25,
      flexDirection: 'row',
      alignItems: 'center',
      gap: isWide ? 8 : 5,
    },
    linkedUnderlineTextButton: {
      height: isWide ? 24 : 22,
      justifyContent: 'center',
      flexShrink: 0,
    },
    linkedUnderlineInputText: {
      flexShrink: 0,
      minWidth: 0,
      color: Colors.primary,
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 18 : 14,
      fontWeight: '700',
      letterSpacing: 0,
      includeFontPadding: false,
    },
    linkedUnderlineEditInput: {
      flex: 1,
      minWidth: 0,
      paddingRight: 0,
    },
    systemSearchButton: {
      minHeight: isWide ? 24 : 22,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: '#F2F7FF',
      paddingHorizontal: isWide ? 9 : 7,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      flexShrink: 0,
    },
    systemSearchButtonText: {
      color: Colors.primary,
      fontSize: isWide ? 10.5 : 8.2,
      lineHeight: isWide ? 13 : 10,
      fontWeight: '900',
    },
    pdfBand: {
      height: isWide ? 32 : 28,
      backgroundColor: '#F18B20',
      borderWidth: 1,
      borderColor: '#222222',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 0,
    },
    pdfBandText: {fontSize: isWide ? 17 : 12.5, lineHeight: isWide ? 32 : 28, color: '#000000', fontWeight: '900', textAlign: 'center', textAlignVertical: 'center'},
    infoBlock: {flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#222222'},
    infoLeft: {flex: 1, padding: 6, gap: 4, borderRightWidth: 1, borderRightColor: '#222222'},
    infoRight: {width: isWide ? 326 : 178, paddingHorizontal: isWide ? 18 : 8, paddingTop: 8, alignItems: 'center'},
    pdfFieldLabel: {fontSize: isWide ? 14 : 10.5, lineHeight: isWide ? 18 : 14, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    locationBox: {
      minHeight: isWide ? 116 : 86,
      borderWidth: 1.4,
      borderColor: '#333333',
      color: '#222222',
      fontSize: isWide ? 13 : 10,
      lineHeight: isWide ? 17 : 14,
      padding: 6,
      textAlignVertical: 'top',
      backgroundColor: '#FFFFFF',
    },
    descriptionBox: {
      minHeight: isWide ? 220 : 162,
      borderWidth: 1.4,
      borderColor: '#333333',
      color: '#222222',
      fontSize: isWide ? 13 : 10,
      lineHeight: isWide ? 17 : 14,
      padding: 6,
      textAlignVertical: 'top',
      backgroundColor: '#FFFFFF',
    },
    dimensionTitle: {fontSize: isWide ? 13.5 : 9.5, lineHeight: isWide ? 16 : 11.5, color: '#111111', fontWeight: '900', textAlign: 'center', textAlignVertical: 'center'},
    dimensionList: {width: '100%', marginTop: isWide ? 12 : 8, gap: isWide ? 6 : 4},
    dimensionField: {width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6},
    dimensionLabel: {width: isWide ? 26 : 22, fontSize: isWide ? 14 : 10.5, lineHeight: isWide ? 17 : 13, fontWeight: '900', color: '#111111', textAlign: 'right', textAlignVertical: 'center'},
    dimensionInput: {
      flex: 1,
      height: isWide ? 25 : 22,
      borderBottomWidth: 1,
      borderBottomColor: '#777777',
      color: '#222222',
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 17 : 13,
      paddingHorizontal: 2,
      paddingVertical: 0,
      backgroundColor: 'transparent',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    dimensionInputSuffixRow: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4},
    dimensionInputWithSuffix: {flex: 1, minWidth: 0},
    dimensionInputSuffix: {fontSize: isWide ? 13 : 10.5, lineHeight: isWide ? 17 : 13, fontWeight: '900', color: '#111111', includeFontPadding: false},
    pleaseTickText: {marginTop: isWide ? 8 : 5, alignSelf: 'flex-end', color: '#FF0000', fontSize: isWide ? 11 : 8.2, lineHeight: isWide ? 14 : 10.5, fontWeight: '900', textAlignVertical: 'center'},
    workTypeList: {alignSelf: 'stretch', gap: isWide ? 10 : 6, marginTop: 2, paddingRight: isWide ? 14 : 8},
    workTypeRow: {minHeight: isWide ? 26 : 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
    workTypeLabel: {flex: 1, fontSize: isWide ? 14 : 9.8, lineHeight: isWide ? 16 : 12, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    pdfTickBox: {
      width: isWide ? 28 : 22,
      height: isWide ? 28 : 22,
      borderWidth: 1.5,
      borderColor: '#333333',
      backgroundColor: '#F4F4F4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pdfTickBoxSmall: {width: isWide ? 24 : 20, height: isWide ? 24 : 20},
    labourTable: {borderLeftWidth: 1, borderTopWidth: 1, borderColor: '#222222'},
    labourPdfRow: {
      width: '100%',
      height: isWide ? 34 : 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#222222',
      backgroundColor: '#FFFFFF',
    },
    labourPdfRowTint: {backgroundColor: '#F8E0C8'},
    labourPdfField: {flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 0, height: isWide ? 22 : 20},
    labourPdfFieldSmall: {flex: 0.82, flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 0, height: isWide ? 22 : 20},
    labourPdfLabel: {fontSize: isWide ? 12 : 9.2, lineHeight: isWide ? 15 : 11.5, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    labourPdfInput: {flex: 1, height: isWide ? 22 : 20, borderBottomWidth: 1, borderBottomColor: '#777777', color: '#222222', fontSize: isWide ? 12 : 9.2, lineHeight: isWide ? 15 : 11.5, fontWeight: '900', paddingHorizontal: 1, paddingVertical: 0, backgroundColor: 'transparent', textAlignVertical: 'center', includeFontPadding: false},
    labourPdfInputSmall: {flex: 1, height: isWide ? 22 : 20, borderBottomWidth: 1, borderBottomColor: '#777777', color: '#222222', fontSize: isWide ? 12 : 9.2, lineHeight: isWide ? 15 : 11.5, fontWeight: '900', paddingHorizontal: 1, paddingVertical: 0, backgroundColor: 'transparent', textAlignVertical: 'center', includeFontPadding: false},
    labourPressableText: {fontSize: isWide ? 12 : 9.2, lineHeight: isWide ? 15 : 11.5, fontWeight: '900'},
    labourTotalValue: {
      flex: 1,
      width: 0,
      height: isWide ? 24 : 21,
      borderWidth: 1.5,
      borderColor: '#F01818',
      color: '#222222',
      fontSize: isWide ? 12 : 9.2,
      lineHeight: isWide ? 15 : 11.5,
      fontWeight: '900',
      paddingHorizontal: 1,
      paddingVertical: 0,
      backgroundColor: 'transparent',
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    removeLabourButton: {width: 20, height: 22, alignItems: 'center', justifyContent: 'center'},
    addLabourRow: {
      width: '100%',
      height: isWide ? 34 : 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#222222',
      backgroundColor: '#F4F4F4',
    },
    addLabourRowText: {fontSize: isWide ? 12 : 9.2, lineHeight: isWide ? 15 : 11.5, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    transportRow: {
      minHeight: isWide ? 46 : 42,
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: '#222222',
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    transportLeftGroup: {
      flex: 1,
      minWidth: 0,
      minHeight: isWide ? 45 : 41,
      paddingHorizontal: isWide ? 10 : 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: isWide ? 8 : 4,
    },
    transportEngineerGroup: {
      flex: 1,
      minWidth: 0,
      minHeight: isWide ? 45 : 41,
      borderLeftWidth: 1,
      borderStyle: 'dashed',
      borderLeftColor: '#E59A9A',
      paddingHorizontal: isWide ? 10 : 5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isWide ? 7 : 3,
    },
    transportLabel: {fontSize: isWide ? 14 : 9.8, lineHeight: isWide ? 17 : 12.5, fontWeight: '900', color: '#111111', textAlignVertical: 'center'},
    transportInput: {flex: 1, minWidth: 0, height: 32, borderWidth: 1.2, borderColor: '#333333', backgroundColor: '#F2F2F2', color: '#222222', paddingHorizontal: 7, paddingTop: 0, paddingBottom: 0, fontSize: isWide ? 13 : 9.8, lineHeight: isWide ? 17 : 13, textAlignVertical: 'center', includeFontPadding: false},
    pleaseTickInline: {fontSize: isWide ? 11.2 : 8.5, lineHeight: isWide ? 14.5 : 11, color: '#FF0000', fontWeight: '900', textAlignVertical: 'center'},
    transportOptionLabel: {fontSize: isWide ? 13 : 9.2, lineHeight: isWide ? 16 : 11.5, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    materialHeader: {
      minHeight: isWide ? 40 : 36,
      marginTop: 6,
      paddingHorizontal: isWide ? 10 : 5,
      backgroundColor: '#F8E0C8',
      borderWidth: 1,
      borderColor: '#222222',
      flexDirection: 'row',
      alignItems: 'center',
      alignContent: 'center',
      justifyContent: 'flex-start',
      flexWrap: 'wrap',
      gap: isWide ? 8 : 4,
    },
    materialLabel: {fontSize: isWide ? 14 : 9.8, lineHeight: isWide ? 17 : 12.5, color: '#111111', fontWeight: '900', textAlignVertical: 'center'},
    materialOptionText: {fontSize: isWide ? 13 : 9.2, lineHeight: isWide ? 16 : 11.5, color: '#111111', fontWeight: '700', textAlignVertical: 'center'},
    materialBox: {
      minHeight: isWide ? 106 : 86,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#222222',
      color: '#333333',
      fontSize: isWide ? 13 : 9.8,
      lineHeight: isWide ? 18 : 13.5,
      padding: 8,
      textAlignVertical: 'top',
      backgroundColor: '#FFFFFF',
    },
    materialSelectionBox: {
      alignItems: 'stretch',
      justifyContent: 'center',
    },
    materialManualInput: {
      fontWeight: '600',
      textAlignVertical: 'top',
      justifyContent: 'flex-start',
    },
    materialSelectionBoxFilled: {
      justifyContent: 'flex-start',
    },
    materialListGrid: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: isPhoneLayout ? 0 : isWide ? 12 : 7,
    },
    materialListColumn: {
      flex: 1,
      minWidth: 0,
      gap: isWide ? 3 : 2,
    },
    materialListGridText: {
      minHeight: isWide ? 18 : isPhoneLayout ? 20 : 13.5,
      includeFontPadding: false,
    },
    materialListText: {
      color: '#222222',
      fontSize: isWide ? 13 : 9.8,
      lineHeight: isWide ? 18 : 13.5,
      fontWeight: '700',
      textAlign: 'left',
    },
    materialPlaceholder: {
      flex: 1,
      minHeight: 70,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    materialPlaceholderText: {
      color: '#777777',
      fontSize: isWide ? 13 : 10,
      lineHeight: isWide ? 17 : 13,
      fontWeight: '900',
    },
    pdfPhotoRow: {flexDirection: 'row', borderLeftWidth: 1, borderColor: '#222222'},
    pdfPhotoSlot: {
      flex: 1,
      aspectRatio: isWide ? 1.64 : 1.36,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#222222',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    pdfPhotoPlaceholder: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF'},
    pdfSignatureGrid: {flexDirection: 'row', gap: isWide ? 28 : 8, paddingTop: 18},
    pdfSignatureBlock: {flex: 1, minWidth: 0, gap: 12},
    pdfSignatureNameRow: {height: isWide ? 27 : 25, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0},
    pdfSignatureSignRow: {flexDirection: 'row', alignItems: 'center', gap: isWide ? 8 : 4, minWidth: 0},
    pdfSignatureLabel: {fontSize: isWide ? 14 : 10.5, lineHeight: isWide ? 18 : 14, color: '#111111', fontWeight: '900', textAlignVertical: 'center', includeFontPadding: false},
    pdfSignatureNameInput: {
      flex: 1,
      height: isWide ? 27 : 25,
      borderBottomWidth: 1,
      borderBottomColor: '#777777',
      color: '#222222',
      fontSize: isWide ? 13 : 10.5,
      lineHeight: isWide ? 18 : 14,
      paddingHorizontal: 2,
      paddingVertical: 0,
      backgroundColor: 'transparent',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    pdfSignatureBox: {
      flex: 1,
      height: isWide ? 72 : 52,
      borderWidth: 1.2,
      borderColor: '#333333',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pdfSignaturePlaceholder: {fontSize: isWide ? 12 : 8.2, color: '#999999', fontWeight: '700', textAlign: 'center'},
    pdfInput: {color: '#222222', minWidth: 0},
    pressablePdfInput: {flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: isWide ? 5 : 3},
    pressablePdfInputText: {flexShrink: 1, minWidth: 0, color: '#222222', textAlignVertical: 'center', includeFontPadding: false},
    section: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.md,
      padding: isWide ? Spacing.md : 12,
      gap: 12,
    },
    sectionTitle: {fontSize: FontSize.md, fontWeight: '800', color: theme.text},
    grid: {flexDirection: isWide ? 'row' : 'column', flexWrap: 'wrap', gap: 12},
    inputGroup: {flexGrow: 1, flexBasis: isWide ? '31%' : '100%', gap: 6, minWidth: isWide ? 220 : undefined},
    inputLabel: {fontSize: FontSize.xs, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase'},
    inputWrap: {position: 'relative', justifyContent: 'center'},
    input: {
      minHeight: 44,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      paddingHorizontal: 12,
      paddingRight: 72,
      fontSize: FontSize.sm,
    },
    inputMultiline: {minHeight: 110, paddingTop: 10, textAlignVertical: 'top'},
    inlineButtons: {position: 'absolute', right: 6, flexDirection: 'row', gap: 4},
    iconButton: {width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface},
    choiceGroup: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
    choicePill: {
      minHeight: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choicePillActive: {borderColor: Colors.primary, backgroundColor: '#E8F1FF'},
    choicePillText: {fontSize: FontSize.sm, fontWeight: '700', color: theme.textSecondary},
    choicePillTextActive: {color: Colors.primary},
    labourRow: {
      flexDirection: isWide ? 'row' : 'column',
      flexWrap: 'wrap',
      gap: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.surface,
    },
    photoGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
    photoSlot: {
      width: isWide ? '31.8%' : '100%',
      aspectRatio: 1.25,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    photoImage: {width: '100%', height: '100%'},
    photoPlaceholder: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8},
    photoPlaceholderText: {fontSize: FontSize.sm, color: theme.textSecondary, fontWeight: '700'},
    signatureGrid: {flexDirection: isWide ? 'row' : 'column', gap: 14},
    signatureField: {flex: 1, gap: 8},
    signatureBox: {
      height: 120,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.surface,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    signaturePlaceholder: {color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '700'},
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
    saveButtonDisabled: {opacity: 0.7},
    saveButtonText: {color: '#111827', fontSize: FontSize.sm, fontWeight: '700'},
    modalBackdrop: {flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 16},
    modalBackdropPress: {
      ...StyleSheet.absoluteFillObject,
    },
    calendarCard: {width: '100%', maxWidth: 360, backgroundColor: theme.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: theme.border, padding: Spacing.md},
    calendarHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm},
    calendarTitle: {fontSize: FontSize.md, fontWeight: '800', color: theme.text},
    calendarNavButton: {width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center'},
    calendarWeekRow: {flexDirection: 'row', marginBottom: 6},
    calendarWeekDay: {flex: 1, textAlign: 'center', color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '800'},
    calendarGrid: {flexDirection: 'row', flexWrap: 'wrap'},
    calendarDayCell: {width: '14.2857%', aspectRatio: 1, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center'},
    calendarDayCellEmpty: {opacity: 0.2},
    calendarDayText: {fontSize: FontSize.sm, fontWeight: '800', color: theme.text},
    signatureModal: {width: '100%', maxWidth: 720, backgroundColor: theme.card, borderRadius: BorderRadius.md, padding: 14, gap: 12},
    modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
    modalTitle: {fontSize: FontSize.lg, fontWeight: '800', color: theme.text},
    signatureCanvas: {height: 280, borderWidth: 1, borderColor: theme.border, borderRadius: BorderRadius.sm, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
    modalActions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10},
    secondaryButton: {minHeight: 42, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 16, justifyContent: 'center'},
    secondaryButtonText: {fontSize: FontSize.sm, color: theme.text, fontWeight: '800'},
    primaryButton: {minHeight: 42, borderRadius: BorderRadius.sm, backgroundColor: Colors.primary, paddingHorizontal: 18, justifyContent: 'center'},
    primaryButtonText: {fontSize: FontSize.sm, color: '#FFFFFF', fontWeight: '800'},
    materialPickerModal: {
      width: isPhoneLayout ? '96%' : '92%',
      maxWidth: 1120,
      height: isPhoneLayout ? '88%' : '86%',
      backgroundColor: theme.card,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: isPhoneLayout ? 12 : 16,
      gap: 12,
    },
    materialPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    materialPickerTitle: {
      color: theme.text,
      fontSize: isPhoneLayout ? 18 : 22,
      lineHeight: isPhoneLayout ? 23 : 28,
      fontWeight: '900',
    },
    materialPickerSubtitle: {
      color: theme.textSecondary,
      fontSize: FontSize.sm,
      marginTop: 2,
    },
    materialPickerSearchRow: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    materialPickerSearchInput: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontSize: FontSize.sm,
      paddingVertical: 0,
    },
    materialPickerColumnHeader: {
      minHeight: 34,
      borderRadius: BorderRadius.sm,
      backgroundColor: '#F8E0C8',
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    materialPickerColumnTitle: {color: '#111111', fontSize: FontSize.sm, fontWeight: '900', textTransform: 'uppercase'},
    materialPickerQtyTitle: {width: 82, color: '#111111', fontSize: FontSize.sm, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase'},
    materialPickerList: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.card,
    },
    materialPickerListContent: {
      paddingBottom: 8,
    },
    materialPickerSectionRow: {
      minHeight: 38,
      justifyContent: 'center',
      paddingHorizontal: 14,
      backgroundColor: '#FFF3E5',
      borderLeftWidth: 5,
      borderLeftColor: Colors.primary,
      borderBottomWidth: 1,
      borderBottomColor: '#F4C99B',
    },
    materialPickerSectionText: {
      color: '#111111',
      fontSize: isPhoneLayout ? FontSize.xs : FontSize.sm,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    materialPickerRow: {
      minHeight: 54,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    materialPickerItemTextWrap: {flex: 1, minWidth: 0},
    materialPickerItemLabel: {color: theme.text, fontSize: FontSize.sm, lineHeight: 18, fontWeight: '800'},
    materialPickerItemSpec: {color: theme.textSecondary, fontSize: FontSize.xs, marginTop: 2, fontWeight: '700'},
    materialPickerQtyInput: {
      width: 82,
      minHeight: 38,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      color: theme.text,
      backgroundColor: theme.surface,
      textAlign: 'center',
      fontSize: FontSize.md,
      fontWeight: '900',
      paddingVertical: 0,
      paddingHorizontal: 6,
    },
    materialPickerFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10,
    },
    drawingRegisterCard: {width: '100%', maxWidth: 760, maxHeight: '82%', backgroundColor: theme.card, borderRadius: BorderRadius.md, padding: 14, gap: 12},
    drawingBreadcrumbRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
    breadcrumbButton: {minHeight: 34, borderRadius: 17, backgroundColor: theme.surface, paddingHorizontal: 12, justifyContent: 'center'},
    breadcrumbText: {fontSize: FontSize.sm, fontWeight: '700', color: theme.text},
    errorText: {fontSize: FontSize.sm, color: '#B42318'},
    drawingRegisterList: {maxHeight: 440},
    emptyRegisterText: {textAlign: 'center', color: theme.textSecondary, paddingVertical: 40},
    drawingRegisterItem: {minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.border},
    drawingRegisterItemText: {flex: 1, minWidth: 0},
    drawingRegisterItemTitle: {fontSize: FontSize.md, fontWeight: '800', color: theme.text},
    drawingRegisterItemPath: {fontSize: FontSize.sm, color: theme.textSecondary, marginTop: 2},
    iOSHeaderSaveButton: {
      minWidth: 56,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      paddingHorizontal: 13,
    },
    iOSHeaderSaveText: {color: '#FFFFFF', fontSize: 13, fontWeight: '700'},
    iOSHeaderShareButton: {
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
    iOSHeaderShareText: {color: Colors.primary, fontSize: 13, fontWeight: '700'},
    userAvatarButton: {width: 38, height: 38, borderRadius: 19, overflow: 'hidden'},
    userAvatarImage: {width: 38, height: 38, borderRadius: 19},
    userAvatarFallback: {width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center'},
    userAvatarFallbackText: {color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '800'},
  });
}
