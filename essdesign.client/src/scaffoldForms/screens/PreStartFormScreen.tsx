// Derived from ESSApp/src/screens/PreStartFormScreen.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import ProjectDataFormDemoModal from '../components/ProjectDataFormDemoModal';
import {
  hideProjectDataWorkflowDemo,
  shouldShowProjectDataWorkflowDemo,
} from '../utils/projectDataWorkflowDemoPreference';
import PreStartDocumentEditor from '../components/PreStartDocumentEditor';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../browser/runtime';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useSafeAreaInsets } from '../browser/safeArea';
import { RootStackParamList } from '../navigation/AppNavigator';
import { usePreferences } from '../context/PreferencesContext';
import { useAuth } from '../context/AuthContext';
import { useFolders } from '../context/FolderContext';
import { Colors, getTheme } from '../theme/appTheme';
import AppTopBar from '../components/AppTopBar';
import CompanyEntitySelector from '../components/CompanyEntitySelector';
import SignaturePadModal from '../components/SignaturePadModal';
import ProjectDataFormShareModal, {
  ProjectDataShareSelection,
} from '../components/ProjectDataFormShareModal';
import {
  createPreStartForm,
  PreStartForm,
  preStartSubject,
  updatePreStartRisk,
  PRE_START_CHECKLIST,
} from '../models/preStart';
import {
  getPreStartFileUrl,
  previewNextPreStartNumber,
  getPreStartForm,
  savePreStartForm,
  uploadPreStartPhoto,
} from '../services/supabasePreStarts';
import { normalizeCompanyEntityId } from '../config/companyEntities';
import { getSafetyBuilders } from '../services/supabaseSafetyProjects';
import { sydneyTodayDisplayDate } from '../utils/sydneyTime';
import { pickFormImage } from '../native/profileImagePicker';
import { composeEmailWithPdf } from '../native/iosEmailComposer';
import {
  collectProjectDataRecipientEmails,
  projectDataPdfFileName,
} from '../utils/projectDataEmail';
import api from '../services/apiService';
import Pdf from '../browser/Pdf';

type Props = NativeStackScreenProps<RootStackParamList, 'PreStartForm'>;
type PendingPhoto = { slot: number; uri: string };
export default function PreStartFormScreen({ navigation, route }: Props) {
  const prefs = usePreferences(),
    theme = getTheme(prefs.themeMode),
    insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { notificationRecipients, loadNotificationRecipients } = useFolders();
  const [showWorkflowDemo, setShowWorkflowDemo] = React.useState(false);
  const [form, setForm] = React.useState(() =>
    ({ ...createPreStartForm(
      route.params,
      sydneyTodayDisplayDate(),
      user?.fullName || '',
    ), companyEntityId: route.params.initialCompanyEntityId || 'ess' }),
  );
  const [loading, setLoading] = React.useState(!!route.params.formId);
  React.useEffect(() => {
    if (!route.params.formId) {
      setForm(current =>
        current.subject
          ? current
          : { ...current, subject: preStartSubject(current.date) },
      );
    }
  }, [route.params.formId]);
  const [loadError, setLoadError] = React.useState('');
  const [numberPreview, setNumberPreview] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const companyTouched = React.useRef(false);
  const [pendingPhotos, setPendingPhotos] = React.useState<PendingPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = React.useState<Record<number, string>>({});
  const [signatureIndex, setSignatureIndex] = React.useState<number | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [shareUrl, setShareUrl] = React.useState('');
  const [showShare, setShowShare] = React.useState(false);
  const [recipientsLoading, setRecipientsLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [emailing, setEmailing] = React.useState(false);
  const readOnly = !!route.params.readOnly;
  const disabled = readOnly || busy || loading || !!loadError;

  React.useEffect(() => {
    let active = true;
    if (!route.params.formId && user?.id) {
      shouldShowProjectDataWorkflowDemo(user.id)
        .then(show => {
          if (active && show) {
            setShowWorkflowDemo(true);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [route.params.formId, user?.id]);

  React.useEffect(() => {
    if (route.params.formId) {
      return;
    }
    let active = true;
    previewNextPreStartNumber(route.params.builderId, route.params.projectId)
      .then(number => {
        if (active) {
          setNumberPreview(number);
        }
      })
      .catch(() => {
        /* Saving still obtains the authoritative number if preview is unavailable. */
      });
    return () => {
      active = false;
    };
  }, [route.params.builderId, route.params.projectId, route.params.formId]);

  React.useEffect(() => {
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
  const load = React.useCallback(async () => {
    if (!route.params.formId) {
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const saved = await getPreStartForm(
        route.params.builderId,
        route.params.projectId,
        route.params.formId,
      );
      if (!saved) {
        throw new Error('This pre-start no longer exists.');
      }
      setForm({
        ...saved,
        subject: saved.subject || preStartSubject(saved.date),
      });
      setDirty(false);
      const photos = await Promise.all(
        saved.photoSlots.map(
          async photo =>
            [photo.slot, await getPreStartFileUrl(photo.path)] as const,
        ),
      );
      setPhotoUrls(Object.fromEntries(photos));
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Could not load the pre-start.',
      );
    } finally {
      setLoading(false);
    }
  }, [route.params.builderId, route.params.projectId, route.params.formId]);
  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    if (route.params.formId || route.params.initialCompanyEntityId) {
      return;
    }
    let active = true;
    getSafetyBuilders(true)
      .then(builders => {
        if (!active || companyTouched.current) {
          return;
        }
        const project = builders
          .find(builder => builder.id === route.params.builderId)
          ?.projects.find(item => item.id === route.params.projectId);
        setForm(current => ({
          ...current,
          companyEntityId: normalizeCompanyEntityId(project?.scaffoldEntity),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [route.params.builderId, route.params.projectId, route.params.formId]);
  const update = <K extends keyof PreStartForm>(
    key: K,
    value: PreStartForm[K],
  ) => {
    if (disabled) {
      return;
    }
    setForm(current => ({
      ...current,
      [key]: value,
      ...(key === 'date' ? { subject: preStartSubject(String(value)) } : {}),
    }));
    setDirty(true);
  };
  const choosePhoto = (slot: number) => {
    if (disabled) {
      return;
    }
    const choose = (source: 'camera' | 'library') => {
      setTimeout(() => {
        pickFormImage(source)
          .then(picked => {
            setPendingPhotos(current => [
              ...current.filter(photo => photo.slot !== slot),
              { slot, uri: picked.uri },
            ]);
            setDirty(true);
          })
          .catch(e => {
            if (!/cancel/i.test(String(e))) {
              Alert.alert(
                'Photo unavailable',
                e instanceof Error ? e.message : 'Please try again.',
              );
            }
          });
      }, 120);
    };
    Alert.alert('Site photo', 'Choose image source', [
      { text: 'Take photo', onPress: () => choose('camera') },
      { text: 'Choose existing', onPress: () => choose('library') },
      ...(photoUrls[slot] || pendingPhotos.some(photo => photo.slot === slot)
        ? [
            {
              text: 'Remove photo',
              style: 'destructive' as const,
              onPress: () => {
                setPendingPhotos(current =>
                  current.filter(photo => photo.slot !== slot),
                );
                setPhotoUrls(current => {
                  const next = { ...current };
                  delete next[slot];
                  return next;
                });
                update(
                  'photoSlots',
                  form.photoSlots.filter(photo => photo.slot !== slot),
                );
              },
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const save = async () => {
    if (busyRef.current || disabled) {
      return;
    }
    if (
      !form.subject.trim() ||
      !form.date.trim() ||
      !form.representativeName.trim()
    ) {
      Alert.alert(
        'Complete form details',
        'Enter the date, representative and subject before saving.',
      );
      return;
    }
    busyRef.current = true;
    companyTouched.current = true;
    setBusy(true);
    try {
      let next = { ...form };
      for (const photo of pendingPhotos) {
        const path = await uploadPreStartPhoto(next, photo.slot, photo.uri);
        next = {
          ...next,
          photoSlots: [
            ...next.photoSlots.filter(item => item.slot !== photo.slot),
            { slot: photo.slot, path },
          ],
        };
        // Keep successful uploads for a retry if a later upload/save fails.
        setForm(next);
        setPendingPhotos(current =>
          current.filter(item => item.slot !== photo.slot),
        );
        setPhotoUrls(current => ({ ...current, [photo.slot]: photo.uri }));
      }
      const saved = await savePreStartForm(next);
      setForm(saved);
      setDirty(false);
      Alert.alert(
        'Pre-start saved',
        `Pre-Start ${saved.preStartNumber} and its PDF are ready to share.`,
      );
    } catch (e) {
      Alert.alert(
        'Save failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const openPdf = async (share: boolean) => {
    if (dirty || !form.pdfPath) {
      Alert.alert(
        'Save first',
        'Save your changes to create the latest PDF before previewing or sharing.',
      );
      return;
    }
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const url = await getPreStartFileUrl(form.pdfPath);
      if (share) {
        setShareUrl(url);
        setShowShare(true);
        setRecipientsLoading(true);
        loadNotificationRecipients()
          .catch(() => {})
          .finally(() => setRecipientsLoading(false));
      } else {
        setPreviewUrl(url);
      }
    } catch (e) {
      Alert.alert(
        'PDF unavailable',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const share = async (selection: ProjectDataShareSelection) => {
    if (sending || emailing) {
      return;
    }
    setSending(true);
    try {
      await api.shareProjectDataForm({
        recipientUserIds: selection.internalRecipients.map(person => person.id),
        externalEmails: selection.externalEmails,
        formType: 'Daily Pre-Start',
        formTitle: form.subject,
        formNumber: form.preStartNumber,
        builderName: form.builderName,
        projectName: form.projectName,
        pdfUrl: shareUrl,
      });
      setShowShare(false);
      Alert.alert(
        'PDF shared',
        'The pre-start was shared with your selected recipients.',
      );
    } catch (e) {
      Alert.alert(
        'Share failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };
  const email = async (selection: ProjectDataShareSelection) => {
    if (sending || emailing) {
      return;
    }
    const recipients = collectProjectDataRecipientEmails(
      selection.internalRecipients,
      selection.externalEmails,
    );
    if (!recipients.length) {
      Alert.alert(
        'Select recipients',
        'Select at least one recipient with an email address.',
      );
      return;
    }
    setEmailing(true);
    try {
      const result = await composeEmailWithPdf({
        to: recipients,
        subject: `${form.subject} - ${form.preStartNumber}`,
        body: `Please find attached the Daily Pre-Start PDF for ${form.projectName}.`,
        pdfUrl: shareUrl,
        fileName: projectDataPdfFileName(
          `Daily Pre-Start ${form.preStartNumber}`,
        ),
      });
      if (result !== 'cancelled') {
        setShowShare(false);
      }
    } catch (e) {
      Alert.alert(
        'Email failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setEmailing(false);
    }
  };
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={{ paddingTop: insets.top, backgroundColor: theme.card }}>
        <AppTopBar
          theme={theme}
          isDarkMode={prefs.themeMode === 'dark'}
          showMenu={false}
          onPressMenu={() => {}}
          onPressBack={requestClose}
          centerContent={
            <CompanyEntitySelector
              entityId={form.companyEntityId}
              formName="Daily Pre-Start"
              theme={theme}
              disabled={disabled}
              onChange={value => {
                companyTouched.current = true;
                update('companyEntityId', value);
              }}
            />
          }
          rightContent={
            dirty || (!form.pdfPath && !readOnly) ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Save pre-start form"
                activeOpacity={0.86}
                style={styles.iOSHeaderSaveButton}
                disabled={busy || loading || !!loadError}
                onPress={save}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.iOSHeaderSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            ) : form.pdfPath && !loading ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Share pre-start form"
                activeOpacity={0.86}
                style={styles.iOSHeaderShareButton}
                disabled={busy}
                onPress={() => openPdf(true)}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.iOSHeaderShareText}>Share</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loading} color={Colors.primary} />
      ) : loadError ? (
        <View style={styles.loading}>
          <Text style={{ color: theme.text }}>{loadError}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.actionText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <PreStartDocumentEditor
            form={form}
            numberPreview={numberPreview}
            disabled={disabled}
            photoUrls={{
              ...photoUrls,
              ...Object.fromEntries(
                pendingPhotos.map(photo => [photo.slot, photo.uri]),
              ),
            }}
            onUpdate={(key, value) => {
              if (key.startsWith('risk.')) {
                update(
                  'risks',
                  updatePreStartRisk(
                    form.risks,
                    Number(key.slice(5)),
                    String(value),
                  ),
                );
              } else if (key.startsWith('checklist.')) {
                update('checklist', {
                  ...form.checklist,
                  [key.slice(10)]: value,
                });
              } else if (key.startsWith('attendee.')) {
                update(
                  'attendees',
                  form.attendees.map((row, i) =>
                    i === Number(key.slice(9))
                      ? { ...row, name: String(value) }
                      : row,
                  ),
                );
              } else {
                update(key as keyof PreStartForm, value as never);
              }
            }}
            onPhoto={choosePhoto}
            onSignature={setSignatureIndex}
            onChecklistYesToAll={() =>
              update(
                'checklist',
                Object.fromEntries(
                  PRE_START_CHECKLIST.map(item => [item.id, true]),
                ) as PreStartForm['checklist'],
              )
            }
          />
        </>
      )}
      <ProjectDataFormDemoModal
        visible={showWorkflowDemo}
        variant="pre-start"
        formNumber={form.preStartNumber || numberPreview}
        referenceName={form.subject}
        representativeName={form.representativeName}
        showDontShowAgain
        onDontShowAgain={() => {
          setShowWorkflowDemo(false);
          if (user?.id) {
            hideProjectDataWorkflowDemo(user.id).catch(() => {});
          }
        }}
        onClose={() => setShowWorkflowDemo(false)}
      />
      <SignaturePadModal
        visible={signatureIndex !== null}
        title={`Attendee ${(signatureIndex ?? 0) + 1} initials`}
        initialStrokes={
          signatureIndex === null
            ? []
            : form.attendees[signatureIndex].signatureStrokes
        }
        onClose={() => setSignatureIndex(null)}
        onApply={signatureStrokes => {
          if (signatureIndex !== null) {
            update(
              'attendees',
              form.attendees.map((row, i) =>
                i === signatureIndex ? { ...row, signatureStrokes } : row,
              ),
            );
          }
          setSignatureIndex(null);
        }}
      />
      <ProjectDataFormShareModal
        visible={showShare}
        theme={theme}
        title={form.subject || 'Daily Pre-Start'}
        recipients={notificationRecipients}
        loadingRecipients={recipientsLoading}
        sharing={sending}
        emailingAttachment={emailing}
        onClose={() => {
          if (!sending && !emailing) {
            setShowShare(false);
          }
        }}
        onShare={share}
        onEmailAttachment={email}
      />
      <Modal
        visible={!!previewUrl}
        animationType="slide"
        onRequestClose={() => setPreviewUrl('')}
      >
        <View
          style={[
            styles.container,
            { paddingTop: insets.top, backgroundColor: theme.background },
          ]}
        >
          <AppTopBar
            theme={theme}
            isDarkMode={prefs.themeMode === 'dark'}
            title="Pre-Start PDF"
            showMenu={false}
            onPressMenu={() => {}}
            onPressBack={() => setPreviewUrl('')}
          />
          {previewUrl ? (
            <Pdf
              source={{ uri: previewUrl, cache: false }}
              style={styles.container}
              trustAllCerts={false}
              onError={() =>
                Alert.alert(
                  'PDF preview unavailable',
                  'Close the preview and try again.',
                )
              }
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  actionText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  iOSHeaderSaveButton: {
    minWidth: 56,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 13,
  },
  iOSHeaderSaveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
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
  iOSHeaderShareText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
