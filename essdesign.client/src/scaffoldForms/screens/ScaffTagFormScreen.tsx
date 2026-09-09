// Derived from ESSApp/src/screens/ScaffTagFormScreen.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {adaptScaffTagStyles} from '../browser/scaffTagStyles';
import {
  ActivityIndicator,
  Alert,
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
  useWindowDimensions,
  View,
} from '../browser/runtime';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from '../browser/safeArea';
import Feather from '../browser/Feather';
import {RootStackParamList} from '../navigation/AppNavigator';
import {usePreferences} from '../context/PreferencesContext';
import {useFolders} from '../context/FolderContext';
import {useAuth} from '../context/AuthContext';
import {BorderRadius, Colors, FontSize, Spacing, getTheme} from '../theme/appTheme';
import AppTopBar from '../components/AppTopBar';
import CompanyEntitySelector from '../components/CompanyEntitySelector';
import SignaturePadModal, {SignaturePadStroke} from '../components/SignaturePadModal';
import SideMenuDrawer from '../components/SideMenuDrawer';
import {pickFormImage} from '../native/profileImagePicker';
import {getSafetyBuilders} from '../services/supabaseSafetyProjects';
import {
  CompanyEntityId,
  DEFAULT_COMPANY_ENTITY_ID,
  getCompanyEntity,
  normalizeCompanyEntityId,
} from '../config/companyEntities';
import {
  allocateNextScaffTagNumber,
  FallProtectionRequired,
  getScaffTagForm,
  getScaffTagPhotoUrl,
  InspectionRecordEntry,
  LoadRating,
  previewNextScaffTagNumber,
  saveScaffTagForm,
  SignatureStroke,
  uploadScaffTagPhoto,
} from '../services/supabaseScaffTags';
import {setHandoverCertificateScaffTagLink} from '../services/supabaseHandoverCertificates';
import {assignScaffTagQrLabel} from '../services/supabaseScaffTagQrLabels';
import {activateScaffoldRegisterRecordById} from '../services/supabaseScaffoldRegister';
import {SYDNEY_TIME_ZONE, getSydneyDateTimeParts, sydneyCalendarDate, sydneyTodayIsoDate} from '../utils/sydneyTime';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ScaffTagForm'>;
  route: RouteProp<RootStackParamList, 'ScaffTagForm'>;
};

type FormState = {
  companyEntityId: CompanyEntityId;
  tagNumber: string;
  scaffoldNo: string;
  handoverFormId: string;
  handoverInspectionNumber: string;
  handoverReferenceName: string;
  dateErected: string;
  requestedBy: string;
  erectedBy: string;
  inspectedBy: string;
  erectedBySignature: string;
  erectedBySignatureStrokes: SignatureStroke[];
  fallProtectionRequired: FallProtectionRequired;
  loadRating: LoadRating;
  loadRatingOther: string;
  checkHandrails: boolean;
  checkPlatform: boolean;
  checkMidRails: boolean;
  checkLadder: boolean;
  checkToeBoards: boolean;
  checkOther: boolean;
  checkOtherText: string;
  inspectionRecords: InspectionRecordEntry[];
};

type ExistingPhoto = {path: string; url: string};
type PendingPhoto = {uri: string; fileName: string};
type DisplayPhoto = {key: string; uri: string};
type SignatureTarget = {type: 'erected'} | {type: 'inspection'; index: number};

const PHOTO_SLOT_COUNT = 2;
const IOS_TAG_PAGE_WIDTH = 454;
const IOS_TAG_SHEET_GAP = 16;
const IOS_TAG_SHEET_WIDTH = IOS_TAG_PAGE_WIDTH * 2 + IOS_TAG_SHEET_GAP;
const IOS_TAG_PAGE_FALLBACK_HEIGHT = 940;

const signatureDrawingStyles = StyleSheet.create({
  stroke: {position: 'absolute', backgroundColor: '#000000'},
});

function readLayoutSize(event: {nativeEvent?: {layout?: {width?: number; height?: number}}} | null | undefined): {
  width: number;
  height: number;
} {
  const layout = event?.nativeEvent?.layout;
  return {
    width: typeof layout?.width === 'number' ? layout.width : 0,
    height: typeof layout?.height === 'number' ? layout.height : 0,
  };
}

function createScaffTagFormId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function inspectionRowHasContent(row: InspectionRecordEntry): boolean {
  return !!(
    row.date.trim() ||
    row.time.trim() ||
    row.competentPerson.trim() ||
    row.note.trim() ||
    row.inspectedAt ||
    (row.signatureStrokes?.length ?? 0) > 0
  );
}

export default function ScaffTagFormScreen({navigation, route}: Props) {
  const prefs = usePreferences();
  const folders = useFolders();
  const {user} = useAuth();
  const signedInUserName = (user?.fullName || user?.email || '').trim();
  const theme = getTheme(prefs.themeMode);
  const insets = useSafeAreaInsets();
  const {width: viewportWidth, height: viewportHeight} = useWindowDimensions();
  const usesIOSDocumentEditor = true; // Same document editor on web.
  const useSideBySideTagPages = viewportWidth >= 980 && !usesIOSDocumentEditor;
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [loading, setLoading] = React.useState(!!route.params.formId);
  const [saving, setSaving] = React.useState(false);
  const [documentPagerWidth, setDocumentPagerWidth] = React.useState(0);
  const [documentPagerHeight, setDocumentPagerHeight] = React.useState(0);
  const [tagPageHeights, setTagPageHeights] = React.useState({
    front: IOS_TAG_PAGE_FALLBACK_HEIGHT,
    back: IOS_TAG_PAGE_FALLBACK_HEIGHT,
  });
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [showSignatureModal, setShowSignatureModal] = React.useState(false);
  const [dateTarget, setDateTarget] = React.useState<{
    type: 'dateErected' | 'inspection';
    index?: number;
  } | null>(null);
  const [calendarMonth, setCalendarMonth] = React.useState(sydneyCalendarDate());
  const [signaturePreviewSize, setSignaturePreviewSize] = React.useState({
    width: 0,
    height: 0,
  });
  const [inspectionSignaturePreviewSizes, setInspectionSignaturePreviewSizes] = React.useState<
    Record<number, {width: number; height: number}>
  >({});
  const [signatureTarget, setSignatureTarget] = React.useState<SignatureTarget>({type: 'erected'});
  const [formId, setFormId] = React.useState(route.params.formId ?? createScaffTagFormId());
  const [scaffoldRegisterId, setScaffoldRegisterId] = React.useState(route.params.initialScaffoldRegisterId ?? '');
  const [createdAt, setCreatedAt] = React.useState<string | undefined>(undefined);
  const [tagNumberPreview, setTagNumberPreview] = React.useState('');
  const [existingPhotos, setExistingPhotos] = React.useState<ExistingPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = React.useState<PendingPhoto[]>([]);
  const frontCardRef = React.useRef<View>(null);
  const backCardRef = React.useRef<View>(null);
  const initialHandoverFormIdRef = React.useRef(route.params.initialHandoverFormId ?? '');
  const companySelectionTouchedRef = React.useRef(false);
  const [form, setForm] = React.useState<FormState>({
    companyEntityId: route.params.initialCompanyEntityId ?? DEFAULT_COMPANY_ENTITY_ID,
    tagNumber: '',
    scaffoldNo: route.params.initialScaffoldName ?? '',
    handoverFormId: route.params.initialHandoverFormId ?? '',
    handoverInspectionNumber: route.params.initialHandoverInspectionNumber ?? '',
    handoverReferenceName: route.params.initialHandoverReferenceName ?? '',
    dateErected: sydneyTodayIsoDate(),
    requestedBy: '',
    erectedBy: '',
    inspectedBy: signedInUserName,
    erectedBySignature: '',
    erectedBySignatureStrokes: [],
    fallProtectionRequired: '',
    loadRating: '',
    loadRatingOther: '',
    checkHandrails: false,
    checkPlatform: false,
    checkMidRails: false,
    checkLadder: false,
    checkToeBoards: false,
    checkOther: false,
    checkOtherText: '',
    inspectionRecords: Array.from({length: 10}, () => ({
      date: '',
      time: '',
      competentPerson: '',
      note: '',
      inspectedAt: '',
      timeZone: SYDNEY_TIME_ZONE,
      signatureStrokes: [],
    })),
  });
  const isReadOnly = route.params.readOnly === true;
  const isScaffoldRegisterLinked = Boolean(scaffoldRegisterId.trim());
  const company = getCompanyEntity(form.companyEntityId);
  const inputEditableProps = isReadOnly ? {editable: false, selectTextOnFocus: false} : {};
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

  React.useEffect(() => {
    if (!route.params.formId) {
      return;
    }
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const existing = await getScaffTagForm(
          route.params.builderId,
          route.params.projectId,
          route.params.formId as string,
        );
        if (!isMounted || !existing) {
          return;
        }

        setFormId(existing.id);
        setScaffoldRegisterId(existing.scaffoldRegisterId);
        setCreatedAt(existing.createdAt);
        initialHandoverFormIdRef.current = existing.handoverFormId;
        setForm({
          companyEntityId: existing.companyEntityId,
          tagNumber: existing.tagNumber,
          scaffoldNo: existing.scaffoldNo,
          handoverFormId: existing.handoverFormId,
          handoverInspectionNumber: existing.handoverInspectionNumber,
          handoverReferenceName: existing.handoverReferenceName,
          dateErected: existing.dateErected,
          requestedBy: existing.requestedBy,
          erectedBy: existing.erectedBy,
          inspectedBy: existing.inspectedBy,
          erectedBySignature: existing.erectedBySignature,
          erectedBySignatureStrokes: existing.erectedBySignatureStrokes ?? [],
          fallProtectionRequired: existing.fallProtectionRequired,
          loadRating: existing.loadRating,
          loadRatingOther: existing.loadRatingOther,
          checkHandrails: existing.checkHandrails,
          checkPlatform: existing.checkPlatform,
          checkMidRails: existing.checkMidRails,
          checkLadder: existing.checkLadder,
          checkToeBoards: existing.checkToeBoards,
          checkOther: existing.checkOther,
          checkOtherText: existing.checkOtherText,
          inspectionRecords: existing.inspectionRecords,
        });

        const photoUrls = await Promise.all(
          existing.photoPaths.slice(0, PHOTO_SLOT_COUNT).map(async path => ({
            path,
            url: await getScaffTagPhotoUrl(path),
          })),
        );

        if (isMounted) {
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
  }, [route.params.builderId, route.params.projectId, route.params.formId]);

  React.useEffect(() => {
    if (loading || !signedInUserName) {
      return;
    }
    setForm(previous => (previous.inspectedBy.trim() ? previous : {...previous, inspectedBy: signedInUserName}));
  }, [loading, signedInUserName]);

  React.useEffect(() => {
    if (form.tagNumber.trim()) {
      setTagNumberPreview('');
      return;
    }
    let active = true;
    previewNextScaffTagNumber(route.params.builderId, route.params.projectId)
      .then(nextNumber => {
        if (active) {
          setTagNumberPreview(nextNumber);
        }
      })
      .catch(() => {
        if (active) {
          setTagNumberPreview('');
        }
      });
    return () => {
      active = false;
    };
  }, [form.tagNumber, route.params.builderId, route.params.projectId]);

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
        const builder =
          builders.find(item => item.id === route.params.builderId) ??
          builders.find(item => item.name.trim().toLowerCase() === route.params.builderName.trim().toLowerCase());
        const project =
          builder?.projects.find(item => item.id === route.params.projectId) ??
          builder?.projects.find(
            item => item.name.trim().toLowerCase() === route.params.projectName.trim().toLowerCase(),
          );
        setForm(previous => ({
          ...previous,
          companyEntityId: normalizeCompanyEntityId(project?.scaffoldEntity),
        }));
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

  React.useEffect(() => {
    if (!isReadOnly) {
      return;
    }
    setShowDatePicker(false);
    setShowSignatureModal(false);
    setDateTarget(null);
  }, [isReadOnly]);

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (isReadOnly) {
      return;
    }
    if (existingPhotos.length + pendingPhotos.length >= PHOTO_SLOT_COUNT) {
      Alert.alert('Photo Limit Reached', 'This scaffold tag form supports two site photos.');
      return;
    }
    try {
      const picked = await pickFormImage(source);
      setPendingPhotos(prev => [
        ...prev,
        {
          uri: picked.uri,
          fileName: picked.fileName || 'scaffold-tag-photo.jpg',
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('E_PICKER_CANCELLED')) {
        console.warn(msg || 'Could not add photo.');
      }
    }
  };

  const handleAddPhoto = () => {
    if (isReadOnly) {
      return;
    }
    Alert.alert('Add Photo', 'Choose image source', [
      {
        text: 'Take Photo',
        onPress: () => {
          pickPhoto('camera').catch(() => {
            // Handled in pickPhoto
          });
        },
      },
      {
        text: 'Choose Existing',
        onPress: () => {
          pickPhoto('library').catch(() => {
            // Handled in pickPhoto
          });
        },
      },
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const openSignatureModal = React.useCallback(
    (target: SignatureTarget = {type: 'erected'}) => {
      if (isReadOnly) {
        return;
      }
      setSignatureTarget(target);
      setShowSignatureModal(true);
    },
    [isReadOnly],
  );

  const applySignature = React.useCallback(
    (strokes: SignaturePadStroke[]) => {
      setForm(prev => {
        if (signatureTarget.type === 'inspection') {
          const next = [...prev.inspectionRecords];
          const current = next[signatureTarget.index] ?? {
            date: '',
            time: '',
            competentPerson: '',
            note: '',
            inspectedAt: '',
            timeZone: SYDNEY_TIME_ZONE,
            signatureStrokes: [],
          };
          const parts = getSydneyDateTimeParts();
          const shouldStamp =
            strokes.length > 0 ||
            !!(current.date.trim() || current.time.trim() || current.competentPerson.trim() || current.note.trim());
          next[signatureTarget.index] = {
            ...current,
            ...(shouldStamp
              ? {
                  date: current.date || parts.isoDate,
                  time: current.time || parts.displayTime,
                  inspectedAt: current.inspectedAt || parts.instant,
                  timeZone: SYDNEY_TIME_ZONE,
                }
              : {}),
            signatureStrokes: strokes,
          };
          return {...prev, inspectionRecords: next};
        }

        return {
          ...prev,
          erectedBySignature: '',
          erectedBySignatureStrokes: strokes,
        };
      });
      setShowSignatureModal(false);
    },
    [signatureTarget],
  );

  const renderSignatureStrokes = React.useCallback(
    (strokes: SignatureStroke[], width: number, height: number, alignLeft = false) => {
      if (width <= 0 || height <= 0) {
        return null;
      }
      const strokeWidth = 2.6;
      const capSize = 3.2;
      const nodes: React.ReactNode[] = [];
      const validPoints = strokes
        .flatMap(stroke => (Array.isArray(stroke) ? stroke : []))
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
      const minimumX = alignLeft && validPoints.length > 0 ? Math.min(...validPoints.map(point => point.x)) : 0;
      const leftPadding = alignLeft ? 2 : 0;
      const signatureWidth = Math.max(1, width - leftPadding);
      const pointX = (x: number) => leftPadding + (x - minimumX) * signatureWidth;

      strokes.forEach((stroke, strokeIndex) => {
        if (!Array.isArray(stroke) || stroke.length === 0) {
          return;
        }

        for (let i = 1; i < stroke.length; i += 1) {
          const prev = stroke[i - 1];
          const curr = stroke[i];

          const x1 = pointX(prev.x);
          const y1 = prev.y * height;
          const x2 = pointX(curr.x);
          const y2 = curr.y * height;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);

          if (!Number.isFinite(length) || length < 0.5) {
            continue;
          }

          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;
          const solidLength = length + strokeWidth * 1.5;
          nodes.push(
            <View
              key={`sig-seg-${strokeIndex}-${i}`}
              style={[
                signatureDrawingStyles.stroke,
                {
                  left: centerX - solidLength / 2,
                  top: centerY - strokeWidth / 2,
                  width: solidLength,
                  height: strokeWidth,
                  borderRadius: strokeWidth / 2,
                  transform: [{rotateZ: `${angle}deg`}],
                },
              ]}
            />,
          );
        }

        const last = stroke[stroke.length - 1];
        nodes.push(
          <View
            key={`sig-cap-${strokeIndex}`}
            style={[
              signatureDrawingStyles.stroke,
              {
                left: Math.max(0, Math.min(width - capSize, pointX(last.x) - capSize / 2)),
                top: Math.max(0, Math.min(height - capSize, last.y * height - capSize / 2)),
                width: capSize,
                height: capSize,
                borderRadius: capSize / 2,
              },
            ]}
          />,
        );
      });

      return nodes;
    },
    [],
  );

  const openDatePicker = (target: {type: 'dateErected' | 'inspection'; index?: number}, value?: string) => {
    if (isReadOnly) {
      return;
    }
    setDateTarget(target);
    const base = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : sydneyCalendarDate();
    setCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setShowDatePicker(true);
  };

  const applyPickedDate = (isoDate: string) => {
    if (!dateTarget) {
      return;
    }
    if (dateTarget.type === 'dateErected') {
      setForm(prev => ({...prev, dateErected: isoDate}));
    } else if (dateTarget.type === 'inspection' && typeof dateTarget.index === 'number') {
      setInspectionRow(dateTarget.index, 'date', isoDate);
    }
    setShowDatePicker(false);
    setDateTarget(null);
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

  const setInspectionRow = (index: number, key: keyof InspectionRecordEntry, value: string) => {
    setForm(prev => {
      const next = [...prev.inspectionRecords];
      const current = next[index];
      const parts = getSydneyDateTimeParts();
      const shouldStamp = key === 'date' || key === 'competentPerson' || key === 'note';
      next[index] = {
        ...current,
        [key]: value,
        ...(shouldStamp && value.trim()
          ? {
              date: key === 'date' ? value : current.date || parts.isoDate,
              time: current.time || parts.displayTime,
              inspectedAt: current.inspectedAt || parts.instant,
              timeZone: SYDNEY_TIME_ZONE,
            }
          : {}),
      };
      return {...prev, inspectionRecords: next};
    });
  };

  const autofillInspectionRow = (index: number) => {
    if (isReadOnly) {
      return;
    }
    const parts = getSydneyDateTimeParts();
    setForm(previous => {
      const inspectionRecords = [...previous.inspectionRecords];
      const current = inspectionRecords[index];
      inspectionRecords[index] = {
        ...current,
        date: current.date || parts.isoDate,
        time: current.time || parts.displayTime,
        competentPerson: current.competentPerson || signedInUserName,
        inspectedAt: current.inspectedAt || parts.instant,
        timeZone: SYDNEY_TIME_ZONE,
      };
      return {...previous, inspectionRecords};
    });
  };

  const handleSave = async () => {
    if (isReadOnly) {
      return;
    }
    if (!form.scaffoldNo.trim()) {
      Alert.alert('Scaffold Name Required', 'Please enter a scaffold name before saving.');
      return;
    }

    setSaving(true);
    try {
      const nextId = formId;
      const tagNumber =
        form.tagNumber.trim() || (await allocateNextScaffTagNumber(route.params.builderId, route.params.projectId));
      if (tagNumber !== form.tagNumber) {
        setForm(previous => ({...previous, tagNumber}));
        // Let the authoritative allocated number render before the live tag
        // views are drawn into the saved PDF.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      const uploadedPhotoPaths = existingPhotos.map(photo => photo.path).slice(0, PHOTO_SLOT_COUNT);
      if (pendingPhotos.length > 0) {
        const newPhotoPaths = await Promise.all(
          pendingPhotos.map(pending =>
            uploadScaffTagPhoto(route.params.builderId, route.params.projectId, nextId, pending.uri, pending.fileName),
          ),
        );
        uploadedPhotoPaths.push(...newPhotoPaths);
      }

      const saved = await saveScaffTagForm({
        id: nextId,
        createdAt,
        builderId: route.params.builderId,
        builderName: route.params.builderName,
        projectId: route.params.projectId,
        projectName: route.params.projectName,
        companyEntityId: form.companyEntityId,
        tagNumber,
        scaffoldNo: form.scaffoldNo.trim(),
        scaffoldRegisterId,
        handoverFormId: form.handoverFormId,
        handoverInspectionNumber: form.handoverInspectionNumber.trim(),
        handoverReferenceName: form.handoverReferenceName.trim(),
        jobLocation: route.params.projectName,
        dateErected: form.dateErected.trim(),
        requestedBy: form.requestedBy.trim(),
        erectedBy: form.erectedBy.trim(),
        inspectedBy: form.inspectedBy.trim() || signedInUserName,
        erectedBySignature: form.erectedBySignature.trim(),
        erectedBySignatureStrokes: form.erectedBySignatureStrokes,
        fallProtectionRequired: form.fallProtectionRequired,
        loadRating: form.loadRating,
        loadRatingOther: form.loadRatingOther.trim(),
        checkHandrails: form.checkHandrails,
        checkPlatform: form.checkPlatform,
        checkMidRails: form.checkMidRails,
        checkLadder: form.checkLadder,
        checkToeBoards: form.checkToeBoards,
        checkOther: form.checkOther,
        checkOtherText: form.checkOtherText.trim(),
        inspectionRecords: form.inspectionRecords,
        photoPaths: uploadedPhotoPaths.slice(0, PHOTO_SLOT_COUNT),
      });

      const previousHandoverFormId = initialHandoverFormIdRef.current;
      if (previousHandoverFormId && previousHandoverFormId !== saved.handoverFormId) {
        await setHandoverCertificateScaffTagLink(
          route.params.builderId,
          route.params.projectId,
          previousHandoverFormId,
          '',
          '',
        );
      }
      if (saved.handoverFormId) {
        await setHandoverCertificateScaffTagLink(
          route.params.builderId,
          route.params.projectId,
          saved.handoverFormId,
          saved.id,
          saved.tagNumber,
        );
      }
      initialHandoverFormIdRef.current = saved.handoverFormId;

      setFormId(saved.id);
      setScaffoldRegisterId(saved.scaffoldRegisterId);
      setCreatedAt(saved.createdAt);
      setForm(previous => ({
        ...previous,
        tagNumber: saved.tagNumber,
        handoverFormId: saved.handoverFormId,
        handoverInspectionNumber: saved.handoverInspectionNumber,
        handoverReferenceName: saved.handoverReferenceName,
      }));
      const photoUrls = await Promise.all(
        saved.photoPaths.slice(0, PHOTO_SLOT_COUNT).map(async path => ({path, url: await getScaffTagPhotoUrl(path)})),
      );
      setExistingPhotos(photoUrls);
      setPendingPhotos([]);

      let qrLinkError = '';
      if (route.params.initialQrLabelToken) {
        try {
          const label = await assignScaffTagQrLabel(
            route.params.initialQrLabelToken,
            route.params.builderId,
            route.params.projectId,
            saved.id,
            false,
          );
          await activateScaffoldRegisterRecordById(
            route.params.builderId,
            route.params.projectId,
            saved.scaffoldRegisterId,
            label.assignedAt,
          );
        } catch (error) {
          qrLinkError = error instanceof Error ? error.message : 'The QR label could not be linked.';
        }
      }

      if (qrLinkError) {
        Alert.alert('Scaff-Tag Saved', `The Scaff-Tag was saved, but the QR label was not linked. ${qrLinkError}`, [
          {text: 'OK', onPress: () => navigation.goBack()},
        ]);
      } else {
        navigation.goBack();
      }
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'Unable to save scaffold tag. Please try again.';
      Alert.alert('Save Failed', message);
    } finally {
      setSaving(false);
    }
  };

  const styles = makeStyles(theme);
  const initials = (user?.fullName?.trim()?.[0] ?? 'U').toUpperCase();
  const referenceNumber = form.tagNumber || tagNumberPreview || '-----';
  const lastActiveInspectionIndex = form.inspectionRecords.reduce(
    (lastIndex, row, index) => (inspectionRowHasContent(row) ? index : lastIndex),
    -1,
  );
  const nextAvailableInspectionIndex =
    lastActiveInspectionIndex < form.inspectionRecords.length - 1 ? lastActiveInspectionIndex + 1 : -1;
  const displayedPhotos = React.useMemo<DisplayPhoto[]>(
    () =>
      [
        ...existingPhotos.map(photo => ({key: photo.path, uri: photo.url})),
        ...pendingPhotos.map(photo => ({key: photo.uri, uri: photo.uri})),
      ].slice(0, PHOTO_SLOT_COUNT),
    [existingPhotos, pendingPhotos],
  );
  const iOSBackPageHeightStyle = React.useMemo(() => ({height: tagPageHeights.front}), [tagPageHeights.front]);

  const renderFormPhotoSlot = (index: number) => {
    const photo = displayedPhotos[index];
    return (
      <TouchableOpacity
        key={`photo-slot-${index}`}
        activeOpacity={isReadOnly ? 1 : 0.85}
        disabled={isReadOnly}
        style={[styles.formPhotoSlot, index === PHOTO_SLOT_COUNT - 1 && styles.formPhotoSlotLast]}
        onPress={handleAddPhoto}
      >
        {photo ? (
          <Image source={{uri: photo.uri}} style={styles.formPhotoImage} />
        ) : (
          <View style={styles.formPhotoEmpty}>
            <Text style={styles.formPhotoIcon}>+</Text>
            <Text style={styles.formPhotoText}>Tap to add photo</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const updateTagPageHeight = (page: 'front' | 'back', nextHeight: number) => {
    if (nextHeight <= 0) {
      return;
    }
    setTagPageHeights(previous =>
      Math.abs(previous[page] - nextHeight) <= 1 ? previous : {...previous, [page]: nextHeight},
    );
  };

  const renderZoomableTagSheet = (document: React.ReactNode) => {
    if (!usesIOSDocumentEditor) {
      return document;
    }

    const availableHeight = Math.max(180, documentPagerHeight || viewportHeight - insets.top - insets.bottom - 112);
    const visibleHeight = Math.max(180, availableHeight - 64 - insets.bottom);
    const pageSlotContentHeight = Math.max(180, visibleHeight - 24);
    const pageHeight = Math.max(tagPageHeights.front, tagPageHeights.back);
    const availableWidth = Math.max(1, documentPagerWidth || viewportWidth);
    // Preserve the existing tag-sheet fit while making the surrounding
    // pan/zoom viewport span the full measured device container.
    const sheetFitWidth = Math.max(1, availableWidth - 24);
    const pageFitScale = Math.min(sheetFitWidth / IOS_TAG_SHEET_WIDTH, pageSlotContentHeight / pageHeight);
    const fittedPageWidth = IOS_TAG_SHEET_WIDTH * pageFitScale;
    const fittedPageHeight = pageHeight * pageFitScale;
    const fittedCanvasStyle = {
      width: fittedPageWidth,
      height: fittedPageHeight,
    };
    // Expand only the pan/zoom viewport. centerContent keeps the fitted tag
    // sheet at the exact same scale and initial position inside it.
    const viewportStyle = {width: availableWidth, height: visibleHeight};

    return (
      <View style={[styles.iOSTagPageSlot, {height: availableHeight}]}>
        <ScrollView
          key={`scaff-tag-sheet-${availableWidth}-${pageHeight}`}
          testID="ess-scaff-tag-stable-scroll-sheet"
          style={[styles.iOSTagPageViewport, viewportStyle]}
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
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.iOSTagPageFitCanvas, fittedCanvasStyle]}>
            <View
              style={[
                styles.iOSTagPageCanvas,
                {
                  width: IOS_TAG_SHEET_WIDTH,
                  height: pageHeight,
                  transform: [{scale: pageFitScale}],
                },
              ]}
            >
              {document}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
              formName="Scaff-Tag"
              theme={theme}
              disabled={isReadOnly}
              onChange={companyEntityId => {
                companySelectionTouchedRef.current = true;
                setForm(previous => ({...previous, companyEntityId}));
              }}
            />
          }
          rightContent={
            usesIOSDocumentEditor && !isReadOnly ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Save scaffold tag"
                activeOpacity={0.86}
                style={styles.iOSHeaderSaveButton}
                disabled={saving}
                onPress={handleSave}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.iOSHeaderSaveText}>Save</Text>
                )}
              </TouchableOpacity>
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
        testID={usesIOSDocumentEditor ? 'ess-scaff-tag-stable-scroll-pager' : undefined}
        style={usesIOSDocumentEditor ? styles.iOSTagPager : undefined}
        contentContainerStyle={usesIOSDocumentEditor ? styles.iOSTagPagerContent : styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        scrollEnabled={true}
        decelerationRate={usesIOSDocumentEditor ? 'fast' : 'normal'}
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
        }}
      >
        {renderZoomableTagSheet(
          <View
            style={[
              styles.tagPagesWrap,
              usesIOSDocumentEditor && styles.iOSTagPagesWrap,
              useSideBySideTagPages && styles.tagPagesWrapWide,
            ]}
          >
            <View
              ref={frontCardRef}
              collapsable={false}
              onLayout={event => updateTagPageHeight('front', event.nativeEvent.layout.height)}
              style={[
                styles.tagCapturePage,
                usesIOSDocumentEditor && styles.iOSTagCapturePage,
                useSideBySideTagPages && styles.tagCapturePageSideBySide,
              ]}
            >
              <View style={styles.scaffoldTagInsert}>
                <View style={styles.tagMainHeader}>
                  <Image source={company.logo} style={styles.tagEssLogo} resizeMode="contain" />
                  <View style={styles.tagHeaderTextBlock}>
                    <Text style={styles.tagMainTitle} numberOfLines={1} adjustsFontSizeToFit>
                      SCAFFOLD TAG
                    </Text>
                    <Text style={styles.tagHeaderSubText} numberOfLines={1}>
                      {company.officeAddress}
                    </Text>
                    <Text style={styles.tagHeaderWebsite} numberOfLines={1}>
                      {company.legalName} · {company.phone}
                    </Text>
                  </View>
                </View>
                <View style={styles.tagRecordBand}>
                  <Text style={styles.tagRecordBandText}>ERECTION AND INSPECTION RECORD</Text>
                </View>

                <View style={styles.tagDetailPanel}>
                  <View style={styles.refFieldRow}>
                    <Text style={styles.refFieldLabel}>Location:</Text>
                    <View style={styles.refFieldBox}>
                      <Text style={styles.refFieldBoxText}>{route.params.projectName}</Text>
                    </View>
                  </View>
                  <View style={[styles.refFieldRow, styles.scaffoldRefFieldRow]}>
                    <Text style={styles.refFieldLabel}>Scaffold:</Text>
                    <View style={styles.refFieldInputWrap}>
                      <TextInput
                        style={styles.refFieldInput}
                        editable={!isReadOnly && !isScaffoldRegisterLinked}
                        selectTextOnFocus={!isReadOnly && !isScaffoldRegisterLinked}
                        value={form.scaffoldNo}
                        onChangeText={value => {
                          setForm(prev => ({
                            ...prev,
                            scaffoldNo: value,
                            handoverFormId: '',
                            handoverInspectionNumber: '',
                            handoverReferenceName: '',
                          }));
                        }}
                        placeholder=""
                        placeholderTextColor="#BFE8D1"
                      />
                    </View>
                  </View>
                  <View style={styles.refFieldRow}>
                    <Text style={styles.refFieldLabel}>Ref. No.:</Text>
                    <View style={styles.refFieldBox}>
                      <Text style={styles.refFieldBoxText}>No. {referenceNumber}</Text>
                    </View>
                  </View>

                  <View style={styles.fallProtectionRow}>
                    <Text style={styles.fallProtectionLabel}>Fall protection required</Text>
                    <View style={styles.fallProtectionChoices}>
                      {(['YES', 'NO'] as FallProtectionRequired[]).map(value => (
                        <TouchableOpacity
                          key={`fall-protection-${value}`}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: form.fallProtectionRequired === value,
                          }}
                          style={styles.compactChoice}
                          disabled={isReadOnly}
                          onPress={() =>
                            setForm(previous => ({
                              ...previous,
                              fallProtectionRequired: previous.fallProtectionRequired === value ? '' : value,
                            }))
                          }
                        >
                          <View style={styles.compactChoiceBox}>
                            {form.fallProtectionRequired === value ? (
                              <Text style={styles.compactChoiceMark}>✓</Text>
                            ) : null}
                          </View>
                          <Text style={styles.compactChoiceLabel}>{value}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.tagLoadPanel}>
                    <View style={styles.tagLoadChoices}>
                      {(
                        [
                          ['Light Duty 225KG', 'LIGHT_DUTY'],
                          ['Medium Duty 450KG', 'MEDIUM_DUTY'],
                          ['Heavy Duty 675KG', 'HEAVY_DUTY'],
                          ['See Engineering Drawing', 'SEE_ENGINEERING'],
                          ['Other', 'OTHER'],
                        ] as Array<[string, LoadRating]>
                      ).map(([label, value]) => (
                        <TouchableOpacity
                          key={value}
                          style={styles.frontLoadRow}
                          disabled={isReadOnly}
                          onPress={() => setForm(prev => ({...prev, loadRating: value}))}
                        >
                          <Text style={styles.frontLoadText}>{label}</Text>
                          <View style={styles.frontLoadCheck}>
                            {form.loadRating === value ? <Text style={styles.frontLoadCheckText}>✓</Text> : null}
                          </View>
                        </TouchableOpacity>
                      ))}
                      {form.loadRating === 'OTHER' ? (
                        <TextInput
                          style={styles.loadRatingOtherInput}
                          {...inputEditableProps}
                          value={form.loadRatingOther}
                          onChangeText={value =>
                            setForm(previous => ({
                              ...previous,
                              loadRatingOther: value,
                            }))
                          }
                          placeholder="Specify other load rating"
                          placeholderTextColor="#64748B"
                        />
                      ) : null}
                    </View>
                    <Text style={styles.tagLoadNote}>
                      THE ABOVE WEIGHTS ARE FOR ONE WORKING PLATFORM ONLY AND INCLUDES MEN AND MATERIALS.
                    </Text>
                  </View>

                  <View style={styles.componentChecksPanel}>
                    <Text style={styles.componentChecksTitle}>Scaffold components complete</Text>
                    <View style={styles.componentChecksGrid}>
                      {(
                        [
                          ['Handrails', 'checkHandrails'],
                          ['Platform', 'checkPlatform'],
                          ['Mid rails', 'checkMidRails'],
                          ['Ladder', 'checkLadder'],
                          ['Toe boards', 'checkToeBoards'],
                          ['Other', 'checkOther'],
                        ] as Array<
                          [
                            string,
                            keyof Pick<
                              FormState,
                              | 'checkHandrails'
                              | 'checkPlatform'
                              | 'checkMidRails'
                              | 'checkLadder'
                              | 'checkToeBoards'
                              | 'checkOther'
                            >,
                          ]
                        >
                      ).map(([label, key]) => (
                        <TouchableOpacity
                          key={key}
                          accessibilityRole="checkbox"
                          accessibilityState={{checked: form[key]}}
                          style={styles.componentCheckChoice}
                          disabled={isReadOnly}
                          onPress={() =>
                            setForm(previous => ({
                              ...previous,
                              [key]: !previous[key],
                            }))
                          }
                        >
                          <View style={styles.compactChoiceBox}>
                            {form[key] ? <Text style={styles.compactChoiceMark}>✓</Text> : null}
                          </View>
                          <Text style={styles.componentCheckLabel}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {form.checkOther ? (
                      <TextInput
                        style={styles.componentOtherInput}
                        {...inputEditableProps}
                        value={form.checkOtherText}
                        onChangeText={value =>
                          setForm(previous => ({
                            ...previous,
                            checkOtherText: value,
                          }))
                        }
                        placeholder="Describe other completed component"
                        placeholderTextColor="#64748B"
                      />
                    ) : null}
                  </View>
                </View>

                <View style={styles.authorisedHeader}>
                  <Text style={styles.authorisedHeaderText}>AUTHORISED PERSON</Text>
                </View>
                <View style={styles.authorisedTable}>
                  <View style={styles.authorisedTableHeader}>
                    <Text style={[styles.authHeaderCell, styles.authDateCell]}>DATE</Text>
                    <Text style={[styles.authHeaderCell, styles.authTimeCell]}>TIME</Text>
                    <Text style={[styles.authHeaderCell, styles.authNameCell]}>NAME</Text>
                    <Text style={[styles.authHeaderCell, styles.authSignatureCell]}>SIGNATURE</Text>
                  </View>
                  {form.inspectionRecords.map((row, index) => {
                    const isActive = inspectionRowHasContent(row);
                    const isNextAvailable = index === nextAvailableInspectionIndex;
                    return (
                      <View key={`front-auth-${index}`} style={styles.authorisedTableRow}>
                        <View style={[styles.authCellButton, styles.authDateCell]}>
                          {isNextAvailable && !isReadOnly ? (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Add inspection row ${index + 1}`}
                              style={styles.inspectionAddButton}
                              onPress={() => autofillInspectionRow(index)}
                            >
                              <Feather name="plus" size={15} color="#0B7F45" />
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.authCellText}>{row.date || ''}</Text>
                          )}
                        </View>
                        <View style={[styles.authInput, styles.authTimeCell, styles.authTimeValueCell]}>
                          <Text style={styles.authCellText}>{row.time || ''}</Text>
                        </View>
                        <TextInput
                          style={[styles.authInput, styles.authNameCell]}
                          editable={!isReadOnly && isActive}
                          selectTextOnFocus={!isReadOnly && isActive}
                          value={row.competentPerson}
                          onChangeText={value => setInspectionRow(index, 'competentPerson', value)}
                          placeholder=""
                          placeholderTextColor="#6B7280"
                        />
                        <TouchableOpacity
                          activeOpacity={isReadOnly || !isActive ? 1 : 0.85}
                          disabled={isReadOnly || !isActive}
                          style={[styles.authSignatureButton, styles.authSignatureCell]}
                          onPress={() => openSignatureModal({type: 'inspection', index})}
                          onLayout={evt => {
                            const size = readLayoutSize(evt);
                            if (size.width <= 0 || size.height <= 0) {
                              return;
                            }
                            setInspectionSignaturePreviewSizes(prev => {
                              const current = prev[index];
                              if (current?.width === size.width && current.height === size.height) {
                                return prev;
                              }
                              return {...prev, [index]: size};
                            });
                          }}
                        >
                          {row.signatureStrokes && row.signatureStrokes.length > 0
                            ? renderSignatureStrokes(
                                row.signatureStrokes,
                                inspectionSignaturePreviewSizes[index]?.width ?? 0,
                                inspectionSignaturePreviewSizes[index]?.height ?? 0,
                              )
                            : null}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.frontCautionBand}>
                  <Text style={styles.frontCautionIcon}>!</Text>
                  <View style={styles.frontCautionTextWrap}>
                    <Text style={styles.frontCautionTitle}>CAUTION</Text>
                    <Text style={styles.frontCautionSub}>BE AWARE OF THE FOLLOWING SCAFFOLD HAZARDS</Text>
                  </View>
                  <Text style={styles.frontCautionIcon}>!</Text>
                </View>
              </View>
            </View>

            <View
              ref={backCardRef}
              collapsable={false}
              onLayout={event => updateTagPageHeight('back', event.nativeEvent.layout.height)}
              style={[
                styles.tagCapturePage,
                usesIOSDocumentEditor && styles.iOSTagCapturePage,
                usesIOSDocumentEditor && iOSBackPageHeightStyle,
                useSideBySideTagPages && styles.tagCapturePageSideBySide,
              ]}
            >
              <View
                style={[
                  styles.scaffoldTagInsert,
                  styles.scaffoldTagReverse,
                  usesIOSDocumentEditor && styles.iOSTagEqualHeightInsert,
                ]}
              >
                <Text style={styles.reverseWarningIcon}>!</Text>
                <Text style={styles.reverseWarningTitle}>WARNING</Text>
                <Text style={styles.reverseWarningText}>
                  UNLAWFUL REMOVAL OR INTERFERENCE WITH THIS TAG COULD MAKE YOU LIABLE TO PROSECUTION AND FINES
                </Text>
                <View style={styles.reverseGreenBand}>
                  <Text style={styles.reverseGreenBandText}>MUST BE FILLED OUT BY AUTHORISED PERSON</Text>
                </View>
                <View style={styles.reverseDetailPanel}>
                  <View style={styles.reverseDetailRow}>
                    <Text style={styles.reverseDetailLabel}>REQUESTED BY:</Text>
                    <TextInput
                      style={styles.reverseDetailInput}
                      {...inputEditableProps}
                      value={form.requestedBy}
                      onChangeText={value => setForm(prev => ({...prev, requestedBy: value}))}
                      placeholder=""
                      placeholderTextColor="#0B7F45"
                    />
                  </View>
                  <View style={styles.reverseDetailRow}>
                    <Text style={styles.reverseDetailLabel}>BUILT BY:</Text>
                    <TextInput
                      style={styles.reverseDetailInput}
                      {...inputEditableProps}
                      value={form.erectedBy}
                      onChangeText={value => setForm(prev => ({...prev, erectedBy: value}))}
                      placeholder=""
                      placeholderTextColor="#0B7F45"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.reverseDetailRow}
                    disabled={isReadOnly}
                    onPress={() => openDatePicker({type: 'dateErected'}, form.dateErected)}
                  >
                    <Text style={styles.reverseDetailLabel}>DATE:</Text>
                    <Text style={styles.reverseDetailText}>{form.dateErected || ''}</Text>
                  </TouchableOpacity>
                  <View style={styles.reverseDetailRow}>
                    <Text style={styles.reverseDetailLabel}>INSPECTED BY:</Text>
                    <TextInput
                      style={styles.reverseDetailInput}
                      {...inputEditableProps}
                      value={form.inspectedBy || signedInUserName}
                      onChangeText={value => setForm(prev => ({...prev, inspectedBy: value}))}
                      placeholder=""
                      placeholderTextColor="#0B7F45"
                    />
                  </View>
                  <View style={styles.reverseDetailRowTall}>
                    <Text style={styles.reverseDetailLabel}>SIGNATURE:</Text>
                    <TouchableOpacity
                      activeOpacity={isReadOnly ? 1 : 0.85}
                      disabled={isReadOnly}
                      onPress={() => openSignatureModal({type: 'erected'})}
                      style={styles.reverseSignatureInline}
                      onLayout={evt => {
                        const size = readLayoutSize(evt);
                        if (size.width > 0 && size.height > 0) {
                          setSignaturePreviewSize(size);
                        }
                      }}
                    >
                      {form.erectedBySignatureStrokes.length > 0
                        ? renderSignatureStrokes(
                            form.erectedBySignatureStrokes,
                            signaturePreviewSize.width,
                            signaturePreviewSize.height,
                            true,
                          )
                        : null}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.standardNote}>Built in accordance with AS/NZS 1576 & AS/NZS 4576</Text>
                </View>

                <View style={styles.complianceHeader}>
                  <Text style={styles.complianceHeaderText}>COMPLIANCE NOTE</Text>
                </View>
                <View style={styles.reverseTable}>
                  <View style={styles.reverseTableHeader}>
                    <Text style={[styles.reverseHeaderCell, styles.reverseDateCell]}>DATE</Text>
                    <Text style={[styles.reverseHeaderCell, styles.reversePersonCell]}>NOTE</Text>
                  </View>
                  {form.inspectionRecords.slice(0, 8).map((row, index) => (
                    <View key={`row-${index}`} style={styles.reverseTableRow}>
                      <View style={[styles.reverseInputButton, styles.reverseDateCell]}>
                        <Text style={styles.reverseInputText}>{row.date || ''}</Text>
                      </View>
                      <TextInput
                        style={[styles.reverseInput, styles.reversePersonCell]}
                        editable={!isReadOnly && inspectionRowHasContent(row)}
                        selectTextOnFocus={!isReadOnly && inspectionRowHasContent(row)}
                        value={row.note}
                        onChangeText={value => setInspectionRow(index, 'note', value)}
                        placeholder=""
                        placeholderTextColor="#6B5A00"
                      />
                    </View>
                  ))}
                </View>

                <View style={[styles.reversePhotosPanel, usesIOSDocumentEditor && styles.iOSReversePhotosPanel]}>
                  <View style={styles.reversePhotosHeader}>
                    <Text style={styles.reversePhotosTitle}>SITE PHOTOS</Text>
                    {!isReadOnly && displayedPhotos.length < PHOTO_SLOT_COUNT ? (
                      <TouchableOpacity style={styles.reversePhotosAddButton} onPress={handleAddPhoto}>
                        <Text style={styles.reversePhotosAddText}>Add Photo</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={[styles.reversePhotoGrid, usesIOSDocumentEditor && styles.iOSReversePhotoGrid]}>
                    {Array.from({length: PHOTO_SLOT_COUNT}, (_, index) => renderFormPhotoSlot(index))}
                  </View>
                </View>
              </View>
            </View>
          </View>,
        )}

        {!usesIOSDocumentEditor && !isReadOnly ? (
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Scaffold Tag</Text>
            )}
          </TouchableOpacity>
        ) : null}
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

      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <Text style={styles.calendarNavText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>
                {calendarMonth.toLocaleString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <Text style={styles.calendarNavText}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                <Text key={day} style={styles.calendarWeekDay}>
                  {day}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {renderCalendarDays().map((day, index) => (
                <TouchableOpacity
                  key={`day-${index}`}
                  style={[styles.calendarDayCell, day == null && styles.calendarDayCellEmpty]}
                  disabled={day == null}
                  onPress={() => {
                    if (day == null) {
                      return;
                    }
                    const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                    const iso = d.toISOString().slice(0, 10);
                    applyPickedDate(iso);
                  }}
                >
                  <Text style={styles.calendarDayText}>{day ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <SignaturePadModal
        visible={showSignatureModal}
        title={signatureTarget.type === 'inspection' ? 'Authorised Person Signature' : 'Inspected By Signature'}
        initialStrokes={
          signatureTarget.type === 'inspection'
            ? form.inspectionRecords[signatureTarget.index]?.signatureStrokes ?? []
            : form.erectedBySignatureStrokes
        }
        onApply={applySignature}
        onClose={() => setShowSignatureModal(false)}
      />
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create(adaptScaffTagStyles({
    container: {flex: 1, backgroundColor: theme.background},
    centered: {justifyContent: 'center', alignItems: 'center'},
    scroll: {padding: Spacing.md, gap: Spacing.sm},
    iOSTagPager: {
      flex: 1,
      backgroundColor: '#FFFFFF',
    },
    iOSTagPagerContent: {
      flexGrow: 1,
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
    },
    iOSTagPageSlot: {
      width: '100%',
      alignItems: 'center',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    iOSTagPageViewport: {
      flexGrow: 0,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    iOSTagPageFitCanvas: {
      overflow: 'hidden',
    },
    iOSTagPageCanvas: {
      position: 'absolute',
      left: 0,
      top: 0,
      transformOrigin: 'top left',
    },
    tagPagesWrap: {
      width: '100%',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    iOSTagPagesWrap: {
      width: IOS_TAG_SHEET_WIDTH,
      height: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: IOS_TAG_SHEET_GAP,
      backgroundColor: '#FFFFFF',
    },
    tagPagesWrapWide: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    tagCapturePage: {
      width: '100%',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      paddingVertical: 18,
      paddingHorizontal: 12,
    },
    iOSTagCapturePage: {
      width: IOS_TAG_PAGE_WIDTH,
      flexShrink: 0,
    },
    tagCapturePageSideBySide: {
      width: 454,
      flexShrink: 0,
    },
    scaffoldTagInsert: {
      width: '100%',
      maxWidth: 430,
      alignSelf: 'center',
      backgroundColor: '#0B4F2F',
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: '#0B4F2F',
    },
    scaffoldTagReverse: {
      backgroundColor: '#F7D319',
      borderColor: '#D6B100',
    },
    iOSTagEqualHeightInsert: {
      flex: 1,
    },
    tagMainHeader: {
      minHeight: 82,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    tagHeaderTextBlock: {
      flex: 1,
      alignItems: 'flex-start',
      justifyContent: 'center',
      minWidth: 0,
    },
    tagMainTitle: {
      color: '#111827',
      fontFamily: 'AvenirNext-DemiBold',
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 29,
      letterSpacing: 0.35,
      textAlign: 'left',
      textTransform: 'uppercase',
    },
    tagHeaderSubText: {
      marginTop: 2,
      color: '#374151',
      fontSize: 9,
      fontWeight: '700',
      lineHeight: 12,
      textAlign: 'left',
    },
    tagHeaderWebsite: {
      marginTop: 1,
      color: '#0B4F2F',
      fontSize: 9,
      fontWeight: '800',
      lineHeight: 12,
      textAlign: 'left',
    },
    tagEssLogo: {
      width: 92,
      height: 56,
    },
    tagRecordBand: {
      minHeight: 34,
      backgroundColor: '#0B4F2F',
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#B8D9C7',
    },
    tagRecordBandText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
      lineHeight: 17,
      letterSpacing: 0.55,
      textTransform: 'uppercase',
    },
    tagDetailPanel: {
      backgroundColor: '#0B4F2F',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    refFieldRow: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    scaffoldRefFieldRow: {
      position: 'relative',
      zIndex: 80,
    },
    refFieldLabel: {
      width: 82,
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
      lineHeight: 17,
    },
    refFieldBox: {
      flex: 1,
      minHeight: 30,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#B8D9C7',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    refFieldBoxText: {
      color: '#111827',
      fontSize: 12,
      fontWeight: '800',
    },
    refFieldInputWrap: {
      flex: 1,
      minHeight: 30,
      position: 'relative',
      zIndex: 80,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#B8D9C7',
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 3,
    },
    refFieldInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 28,
      color: '#111827',
      fontSize: 13,
      fontWeight: '800',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    fallProtectionRow: {
      minHeight: 38,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: '#B8D9C7',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    fallProtectionLabel: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    fallProtectionChoices: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    compactChoice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    compactChoiceBox: {
      width: 20,
      height: 20,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#B8D9C7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactChoiceMark: {
      color: '#0B4F2F',
      fontSize: 15,
      lineHeight: 18,
      fontWeight: '900',
    },
    compactChoiceLabel: {
      color: '#FFFFFF',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '900',
    },
    tagLoadPanel: {
      marginTop: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: '#B8D9C7',
      flexDirection: 'row',
      gap: 10,
    },
    tagLoadChoices: {
      flex: 1,
      gap: 4,
    },
    frontLoadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 24,
    },
    frontLoadText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
      lineHeight: 17,
    },
    frontLoadCheck: {
      width: 20,
      height: 20,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#B8D9C7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    frontLoadCheckText: {
      color: '#0B4F2F',
      fontSize: 16,
      fontWeight: '900',
      lineHeight: 18,
    },
    tagLoadNote: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
      lineHeight: 14,
      letterSpacing: 0.15,
      textTransform: 'uppercase',
    },
    loadRatingOtherInput: {
      minHeight: 30,
      marginTop: 2,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#B8D9C7',
      color: '#111827',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    componentChecksPanel: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: '#B8D9C7',
    },
    componentChecksTitle: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '900',
      letterSpacing: 0.25,
      textTransform: 'uppercase',
    },
    componentChecksGrid: {
      marginTop: 6,
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 6,
    },
    componentCheckChoice: {
      width: '33.3333%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingRight: 5,
    },
    componentCheckLabel: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    componentOtherInput: {
      minHeight: 30,
      marginTop: 7,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#B8D9C7',
      color: '#111827',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    authorisedHeader: {
      minHeight: 36,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#8DA9BE',
    },
    authorisedHeaderText: {
      color: '#111827',
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 22,
      letterSpacing: 0.45,
      textTransform: 'uppercase',
    },
    authorisedTable: {
      backgroundColor: '#FFFFFF',
    },
    authorisedTableHeader: {
      flexDirection: 'row',
      minHeight: 39,
      borderBottomWidth: 1,
      borderBottomColor: '#8DA9BE',
    },
    authHeaderCell: {
      color: '#111827',
      fontSize: 12,
      fontWeight: '900',
      lineHeight: 15,
      textAlign: 'center',
      paddingVertical: 12,
      borderRightWidth: 1,
      borderRightColor: '#8DA9BE',
    },
    authorisedTableRow: {
      minHeight: 39,
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#8DA9BE',
    },
    authDateCell: {
      flex: 0.8,
    },
    authTimeCell: {
      flex: 0.8,
    },
    authTimeValueCell: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    authNameCell: {
      flex: 1.1,
    },
    authSignatureCell: {
      flex: 1.2,
      borderRightWidth: 0,
    },
    authCellButton: {
      borderRightWidth: 1,
      borderRightColor: '#8DA9BE',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    inspectionAddButton: {
      width: 24,
      height: 24,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#0B7F45',
      backgroundColor: '#E8F6EF',
    },
    authCell: {
      borderRightWidth: 1,
      borderRightColor: '#8DA9BE',
    },
    authSignatureButton: {
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
    },
    authCellText: {
      color: '#111827',
      fontSize: 10,
      fontWeight: '800',
      textAlign: 'center',
      width: '100%',
    },
    authInput: {
      borderRightWidth: 1,
      borderRightColor: '#8DA9BE',
      color: '#111827',
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    frontCautionBand: {
      minHeight: 84,
      backgroundColor: '#F7D319',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: 18,
      borderTopWidth: 1,
      borderTopColor: '#D6B100',
    },
    frontCautionIcon: {
      width: 38,
      height: 38,
      borderWidth: 3,
      borderColor: '#111827',
      color: '#111827',
      textAlign: 'center',
      fontSize: 25,
      fontWeight: '900',
      lineHeight: 33,
    },
    frontCautionTextWrap: {
      flex: 1,
      alignItems: 'center',
    },
    frontCautionTitle: {
      color: '#111827',
      fontSize: 17,
      fontWeight: '900',
      lineHeight: 21,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    frontCautionSub: {
      color: '#111827',
      fontSize: 9,
      fontWeight: '900',
      lineHeight: 13,
      letterSpacing: 0.25,
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    reverseWarningIcon: {
      alignSelf: 'center',
      marginTop: 20,
      width: 54,
      height: 54,
      borderWidth: 4,
      borderColor: '#111827',
      color: '#111827',
      textAlign: 'center',
      fontSize: 36,
      fontWeight: '900',
      lineHeight: 48,
    },
    reverseWarningTitle: {
      marginTop: 4,
      color: '#111827',
      fontSize: 22,
      fontWeight: '900',
      lineHeight: 27,
      letterSpacing: 0.8,
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    reverseWarningText: {
      color: '#111827',
      fontSize: 12,
      fontWeight: '900',
      lineHeight: 17,
      letterSpacing: 0.2,
      textAlign: 'center',
      textTransform: 'uppercase',
      paddingHorizontal: 28,
      paddingBottom: 12,
    },
    reverseGreenBand: {
      minHeight: 27,
      backgroundColor: '#0B4F2F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reverseGreenBandText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
      lineHeight: 16,
      letterSpacing: 0.25,
      textTransform: 'uppercase',
    },
    reverseDetailPanel: {
      backgroundColor: '#0B4F2F',
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 8,
    },
    reverseDetailRow: {
      minHeight: 30,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 2,
      borderBottomColor: '#0B4F2F',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    reverseDetailRowTall: {
      minHeight: 46,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    reverseDetailLabel: {
      width: 112,
      color: '#111827',
      fontSize: 12,
      fontWeight: '900',
      lineHeight: 16,
      textTransform: 'uppercase',
    },
    reverseDetailText: {
      flex: 1,
      color: '#111827',
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 16,
    },
    reverseDetailInput: {
      flex: 1,
      color: '#111827',
      fontSize: 12,
      fontWeight: '800',
      paddingVertical: 3,
      paddingHorizontal: 0,
    },
    reverseSignatureInline: {
      flex: 1,
      height: 42,
      overflow: 'hidden',
      position: 'relative',
    },
    standardNote: {
      marginTop: 8,
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      lineHeight: 14,
      textAlign: 'center',
    },
    complianceHeader: {
      minHeight: 40,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#8DA9BE',
    },
    complianceHeaderText: {
      color: '#111827',
      fontSize: 17,
      fontWeight: '900',
      lineHeight: 21,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    reverseTable: {
      backgroundColor: '#FFFFFF',
    },
    reverseTableHeader: {
      flexDirection: 'row',
      minHeight: 42,
      borderBottomWidth: 1,
      borderBottomColor: '#8DA9BE',
    },
    reverseHeaderCell: {
      color: '#111827',
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'center',
      paddingVertical: 13,
      borderRightWidth: 1,
      borderRightColor: '#8DA9BE',
    },
    reverseTableRow: {
      minHeight: 42,
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#8DA9BE',
    },
    reverseDateCell: {
      flex: 0.7,
    },
    reversePersonCell: {
      flex: 1.9,
      borderRightWidth: 0,
    },
    reverseInputButton: {
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: '#8DA9BE',
      paddingHorizontal: 6,
    },
    reverseInputText: {
      color: '#111827',
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
    },
    reverseInput: {
      color: '#111827',
      fontSize: 11,
      fontWeight: '800',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    reversePhotosPanel: {
      backgroundColor: '#F7D319',
      borderTopWidth: 1,
      borderTopColor: '#D6B100',
    },
    iOSReversePhotosPanel: {
      flex: 1,
    },
    reversePhotosHeader: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    reversePhotosTitle: {
      color: '#111827',
      fontSize: 14,
      fontWeight: '900',
      lineHeight: 18,
      letterSpacing: 0.45,
      textTransform: 'uppercase',
    },
    reversePhotosAddButton: {
      position: 'absolute',
      right: 10,
      backgroundColor: '#FFFFFF',
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    reversePhotosAddText: {
      color: '#0B4F2F',
      fontSize: 11,
      fontWeight: '900',
    },
    reversePhotoGrid: {
      flexDirection: 'row',
      minHeight: 104,
      borderTopWidth: 1,
      borderTopColor: '#D6B100',
    },
    iOSReversePhotoGrid: {
      flex: 1,
    },
    scaffSheet: {
      width: '100%',
      maxWidth: 980,
      alignSelf: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#1F2937',
      borderRadius: 8,
      overflow: 'hidden',
      padding: 18,
      gap: 12,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: '#111827',
      paddingBottom: 12,
      gap: 16,
    },
    sheetHeaderCompact: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: '#111827',
      paddingBottom: 10,
      gap: 16,
    },
    sheetBrand: {
      color: '#F7D319',
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    sheetTitle: {
      marginTop: 2,
      color: '#111827',
      fontSize: 30,
      fontWeight: '900',
    },
    sheetTitleSmall: {
      marginTop: 2,
      color: '#111827',
      fontSize: 22,
      fontWeight: '900',
    },
    sheetSubTitle: {
      marginTop: 2,
      color: '#0B7F45',
      fontSize: 15,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    referenceBox: {
      minWidth: 154,
      borderWidth: 2,
      borderColor: '#0B7F45',
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      backgroundColor: '#F8FFF9',
    },
    referenceLabel: {
      color: '#0B7F45',
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    referenceValue: {
      marginTop: 2,
      color: '#111827',
      fontSize: 20,
      fontWeight: '900',
    },
    compactReference: {
      color: '#111827',
      fontSize: 18,
      fontWeight: '900',
      borderWidth: 2,
      borderColor: '#0B7F45',
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: '#F8FFF9',
    },
    readyBanner: {
      backgroundColor: '#0B7F45',
      borderRadius: 4,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    readyBannerText: {
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight: '900',
      textAlign: 'center',
    },
    sheetSection: {
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: 6,
      padding: 12,
      backgroundColor: '#FAFAFA',
    },
    sheetSectionTitle: {
      color: '#111827',
      fontSize: 15,
      fontWeight: '900',
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    sheetHelpText: {
      color: '#6B7280',
      fontSize: 12,
      fontWeight: '700',
      marginTop: -4,
      marginBottom: 8,
    },
    sheetFieldRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
      paddingTop: 8,
      marginTop: 8,
    },
    sheetFieldLabel: {
      width: 170,
      color: '#111827',
      fontSize: 14,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    sheetInput: {
      flex: 1,
      minHeight: 38,
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
      color: '#111827',
      fontSize: 15,
      fontWeight: '700',
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    sheetInputStacked: {
      marginTop: 8,
    },
    sheetReadOnlyValue: {
      flex: 1,
      minHeight: 38,
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 4,
      backgroundColor: '#F3F4F6',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    sheetReadOnlyText: {
      color: '#111827',
      fontSize: 15,
      fontWeight: '700',
    },
    sheetDateButton: {
      flex: 1,
      minHeight: 38,
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    sheetDateText: {
      color: '#111827',
      fontSize: 15,
      fontWeight: '800',
    },
    sheetTwoColumn: {
      flexDirection: 'row',
      gap: 12,
    },
    sheetColumn: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: 6,
      padding: 12,
      backgroundColor: '#FAFAFA',
    },
    sheetSelectBox: {
      minHeight: 38,
      borderWidth: 1,
      borderColor: '#9CA3AF',
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    sheetSelectText: {
      flex: 1,
      color: '#111827',
      fontSize: 15,
      fontWeight: '800',
    },
    sheetCheckGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    sheetCheckRow: {
      width: '32%',
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: 4,
      paddingHorizontal: 8,
    },
    sheetCheckBox: {
      width: 22,
      height: 22,
      borderWidth: 2,
      borderColor: '#374151',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
    },
    sheetCheckMark: {
      color: '#0B7F45',
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 20,
    },
    sheetCheckLabel: {
      flex: 1,
      color: '#111827',
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    signatureSection: {
      borderWidth: 1,
      borderColor: '#D1D5DB',
      borderRadius: 6,
      padding: 12,
      backgroundColor: '#FAFAFA',
    },
    inspectionTable: {
      borderWidth: 1,
      borderColor: '#111827',
      overflow: 'hidden',
    },
    inspectionTableHeader: {
      flexDirection: 'row',
      backgroundColor: '#0B7F45',
      minHeight: 42,
    },
    inspectionHeaderCell: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
      textAlign: 'center',
      textTransform: 'uppercase',
      paddingVertical: 11,
      borderRightWidth: 1,
      borderRightColor: '#FFFFFF',
    },
    inspectionRow: {
      flexDirection: 'row',
      minHeight: 38,
      borderTopWidth: 1,
      borderTopColor: '#D1D5DB',
      backgroundColor: '#FFFFFF',
    },
    inspectionDateCell: {
      flex: 0.7,
    },
    inspectionPersonCell: {
      flex: 1.3,
    },
    inspectionInputButton: {
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: '#D1D5DB',
      paddingHorizontal: 10,
    },
    inspectionInput: {
      color: '#111827',
      fontSize: 14,
      fontWeight: '700',
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    inspectionInputText: {
      color: '#111827',
      fontSize: 14,
      fontWeight: '700',
    },
    formPhotosSection: {
      borderWidth: 1,
      borderColor: '#111827',
      marginTop: 2,
    },
    formPhotosHeader: {
      minHeight: 42,
      backgroundColor: '#F7D319',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    formPhotosTitle: {
      color: '#111827',
      fontSize: 16,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    formPhotosAddButton: {
      position: 'absolute',
      right: 10,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#111827',
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    formPhotosAddText: {
      color: '#111827',
      fontSize: 12,
      fontWeight: '900',
    },
    formPhotoGrid: {
      flexDirection: 'row',
      height: 210,
    },
    formPhotoSlot: {
      flex: 1,
      height: '100%',
      borderRightWidth: 1,
      borderRightColor: '#D6B100',
      backgroundColor: '#FFFBE0',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    formPhotoSlotLast: {
      borderRightWidth: 0,
    },
    formPhotoImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    formPhotoEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    formPhotoIcon: {
      color: '#9CA3AF',
      fontSize: 34,
      fontWeight: '300',
      lineHeight: 36,
    },
    formPhotoText: {
      color: '#6B5A00',
      fontSize: 11,
      fontWeight: '800',
    },
    greenCard: {
      backgroundColor: '#00A651',
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: '#DCEDE4',
      padding: Spacing.md,
    },
    greenTitle: {
      color: '#FFFFFF',
      fontSize: FontSize.lg,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    formLineInput: {
      backgroundColor: '#FFFFFF',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#0B7F45',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 7,
      fontSize: FontSize.sm,
      color: '#1A1A1A',
      marginBottom: Spacing.xs,
    },
    formLineInputButton: {
      backgroundColor: '#FFFFFF',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#0B7F45',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 9,
      marginBottom: Spacing.xs,
    },
    formLineInputButtonText: {
      color: '#1A1A1A',
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
    readOnlyField: {
      backgroundColor: '#E8F6EE',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#0B7F45',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 7,
      marginBottom: Spacing.xs,
    },
    readOnlyLabel: {
      color: '#0B7F45',
      fontSize: FontSize.xs,
      fontWeight: '700',
      marginBottom: 2,
    },
    readOnlyValue: {
      color: '#1A1A1A',
      fontSize: FontSize.sm,
      fontWeight: '700',
    },
    formLineInputTight: {
      marginTop: Spacing.xs,
      marginBottom: 0,
    },
    signatureWrap: {
      marginBottom: Spacing.xs,
    },
    signaturePreview: {
      backgroundColor: '#FFFFFF',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#0B7F45',
      height: 86,
      overflow: 'hidden',
      justifyContent: 'center',
      position: 'relative',
    },
    signaturePlaceholder: {
      textAlign: 'center',
      color: '#0B7F45',
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
    signatureLegacyText: {
      color: '#0B7F45',
      fontSize: FontSize.md,
      fontWeight: '700',
      paddingHorizontal: Spacing.sm,
    },
    signatureActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    signatureActionBtn: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#0B7F45',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xs,
    },
    signatureActionBtnClear: {
      borderColor: '#B91C1C',
    },
    signatureActionText: {
      color: '#0B7F45',
      fontSize: FontSize.sm,
      fontWeight: '700',
    },
    signatureActionTextClear: {
      color: '#B91C1C',
    },
    optionBlock: {
      marginTop: Spacing.sm,
    },
    optionLabel: {
      color: '#FFFFFF',
      fontSize: FontSize.xs,
      fontWeight: '700',
      marginBottom: 6,
    },
    selectBox: {
      backgroundColor: '#FFFFFF',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#0B7F45',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 9,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    selectBoxText: {
      fontSize: FontSize.sm,
      color: '#1A1A1A',
      flex: 1,
      marginRight: Spacing.sm,
    },
    selectChevron: {
      color: '#0B7F45',
      fontSize: 14,
      fontWeight: '700',
    },
    dropList: {
      marginTop: 4,
      backgroundColor: '#FFFFFF',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#0B7F45',
      overflow: 'hidden',
    },
    dropRow: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: '#E7F3EC',
    },
    dropRowText: {
      color: '#1A1A1A',
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
    checkBlock: {
      marginTop: Spacing.sm,
    },
    checkGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    checkRow: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    checkBox: {
      width: 18,
      height: 18,
      borderWidth: 1,
      borderColor: '#FFFFFF',
      backgroundColor: '#FFFFFF',
      marginRight: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkFill: {
      width: 10,
      height: 10,
      backgroundColor: '#0B7F45',
    },
    checkLabel: {
      color: '#FFFFFF',
      fontSize: FontSize.xs,
      fontWeight: '700',
      flex: 1,
    },
    tableHeader: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: '#DCEDE4',
      backgroundColor: '#EAF6EF',
    },
    tableHeaderCell: {
      flex: 1,
      textAlign: 'center',
      color: '#0B7F45',
      fontSize: FontSize.xs,
      fontWeight: '800',
      paddingVertical: 6,
      borderRightWidth: 1,
      borderRightColor: '#DCEDE4',
    },
    tableRow: {
      flexDirection: 'row',
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: '#DCEDE4',
      backgroundColor: '#FFFFFF',
    },
    tableInput: {
      color: '#1A1A1A',
      fontSize: FontSize.xs,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    tableInputDate: {
      flex: 1,
      borderRightWidth: 1,
      borderRightColor: '#DCEDE4',
    },
    tableInputDateButton: {
      flex: 1,
      borderRightWidth: 1,
      borderRightColor: '#DCEDE4',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    tableInputDateText: {
      color: '#1A1A1A',
      fontSize: FontSize.xs,
    },
    tableInputName: {
      flex: 1,
    },
    cardWhite: {
      backgroundColor: theme.card,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSize.md,
      color: theme.text,
      fontWeight: '700',
      marginBottom: Spacing.sm,
    },
    photoHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    photoButton: {
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    photoButtonDisabled: {
      opacity: 0.45,
    },
    photoButtonText: {
      color: '#fff',
      fontSize: FontSize.sm,
      fontWeight: '700',
    },
    photo: {
      width: '100%',
      height: 190,
      borderRadius: BorderRadius.sm,
      marginBottom: Spacing.sm,
      backgroundColor: theme.surface,
    },
    hint: {fontSize: FontSize.sm, color: theme.textSecondary},
    saveButton: {
      height: 48,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    saveButtonText: {color: '#fff', fontSize: FontSize.md, fontWeight: '700'},
    iOSHeaderSaveButton: {
      minWidth: 58,
      height: 36,
      borderRadius: 8,
      paddingHorizontal: 14,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: Spacing.sm,
    },
    iOSHeaderSaveText: {
      color: '#FFFFFF',
      fontSize: FontSize.sm,
      fontWeight: '800',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    optionCheck: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    optionCheckOn: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    optionCheckMark: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 13,
    },
    optionTextWrap: {flex: 1},
    optionTitle: {
      color: theme.text,
      fontSize: FontSize.sm,
      fontWeight: '700',
    },
    optionSub: {
      marginTop: 2,
      color: theme.textSecondary,
      fontSize: FontSize.xs,
      lineHeight: 17,
    },
    userAvatarButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      overflow: 'hidden',
      marginLeft: Spacing.sm,
    },
    userAvatarImage: {width: 38, height: 38, borderRadius: 19},
    userAvatarFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.full,
    },
    userAvatarFallbackText: {color: '#fff', fontWeight: '700', fontSize: 14},
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    calendarCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: theme.card,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: Spacing.md,
    },
    signatureModal: {
      width: '100%',
      maxWidth: 720,
      backgroundColor: theme.card,
      borderRadius: BorderRadius.md,
      padding: 14,
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: {
      color: theme.text,
      fontSize: FontSize.lg,
      fontWeight: '800',
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signatureCanvas: {
      height: 280,
      backgroundColor: '#FFFFFF',
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    secondaryButton: {
      minHeight: 42,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: FontSize.sm,
      fontWeight: '800',
    },
    primaryButton: {
      minHeight: 42,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.primary,
      paddingHorizontal: 18,
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: FontSize.sm,
      fontWeight: '800',
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    calendarTitle: {
      color: theme.text,
      fontSize: FontSize.md,
      fontWeight: '700',
    },
    calendarNavBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    calendarNavText: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginTop: -1,
    },
    calendarWeekRow: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    calendarWeekDay: {
      flex: 1,
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: FontSize.xs,
      fontWeight: '700',
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    calendarDayCell: {
      width: '14.2857%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    calendarDayCellEmpty: {
      opacity: 0.25,
    },
    calendarDayText: {
      color: theme.text,
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
  }));
}
