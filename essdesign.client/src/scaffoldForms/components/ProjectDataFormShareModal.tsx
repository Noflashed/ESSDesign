// Derived from ESSApp/src/components/ProjectDataFormShareModal.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from '../browser/runtime';
import Feather from '../browser/Feather';
import {UserInfo} from '../models/user';
import {BorderRadius, Colors, FontSize, Spacing, getTheme} from '../theme/appTheme';
import {collectProjectDataRecipientEmails} from '../utils/projectDataEmail';

type Theme = ReturnType<typeof getTheme>;

export const ESS_SAFETY_EMAIL = 'erinr@erectsafe.com.au';

export interface ProjectDataShareSelection {
  internalRecipients: UserInfo[];
  externalEmails: string[];
}

interface Props {
  visible: boolean;
  theme: Theme;
  title: string;
  recipients: UserInfo[];
  loadingRecipients: boolean;
  sharing: boolean;
  emailingAttachment?: boolean;
  onClose: () => void;
  onBeforeShare?: () => Promise<void>;
  onShare: (selection: ProjectDataShareSelection) => void;
  onEmailAttachment?: (selection: ProjectDataShareSelection) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function userLabel(user: UserInfo): string {
  return user.fullName || user.email || 'Unnamed employee';
}

function normalizedEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function RecipientAvatar({user, styles}: {user: UserInfo; styles: ReturnType<typeof makeStyles>}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const label = userLabel(user);
  const showImage = !!user.profileImageUrl && !imageFailed;

  React.useEffect(() => {
    setImageFailed(false);
  }, [user.profileImageUrl]);

  return (
    <View style={styles.recipientAvatar}>
      {showImage ? (
        <Image
          source={{uri: user.profileImageUrl as string}}
          style={styles.recipientAvatarImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={styles.recipientAvatarText}>
          {(label.trim()[0] || 'U').toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export default function ProjectDataFormShareModal({
  visible,
  theme,
  title,
  recipients,
  loadingRecipients,
  sharing,
  emailingAttachment = false,
  onClose,
  onBeforeShare,
  onShare,
  onEmailAttachment,
}: Props) {
  const [query, setQuery] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [includeEssSafety, setIncludeEssSafety] = React.useState(true);
  const [externalEmailInput, setExternalEmailInput] = React.useState('');
  const [externalEmails, setExternalEmails] = React.useState<string[]>([]);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const styles = makeStyles(theme);

  React.useEffect(() => {
    setQuery('');
    setSelectedIds(new Set());
    setIncludeEssSafety(true);
    setExternalEmailInput('');
    setExternalEmails([]);
    setEmailError(null);
  }, [visible]);

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    recipients.slice(0, 24).forEach(user => {
      if (user.profileImageUrl) {
        Image.prefetch(user.profileImageUrl).catch(() => {});
      }
    });
  }, [recipients, visible]);

  const availableRecipients = React.useMemo(
    () => recipients.filter(user => normalizedEmail(user.email) !== ESS_SAFETY_EMAIL),
    [recipients],
  );

  const filteredRecipients = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return availableRecipients;
    }

    return availableRecipients.filter(user =>
      [user.fullName, user.email, user.role]
        .some(value => (value || '').toLowerCase().includes(q)),
    );
  }, [availableRecipients, query]);

  const selectedRecipients = React.useMemo(
    () => availableRecipients.filter(user => selectedIds.has(user.id)),
    [availableRecipients, selectedIds],
  );

  const totalRecipientCount =
    (includeEssSafety ? 1 : 0) + selectedRecipients.length + externalEmails.length;
  const currentSelection: ProjectDataShareSelection = {
    internalRecipients: selectedRecipients,
    externalEmails: [
      ...(includeEssSafety ? [ESS_SAFETY_EMAIL] : []),
      ...externalEmails,
    ],
  };
  const attachmentRecipientCount = collectProjectDataRecipientEmails(
    currentSelection.internalRecipients,
    currentSelection.externalEmails,
  ).length;
  const [recordingCompletion, setRecordingCompletion] = React.useState(false);
  const actionInFlight = React.useRef(false);
  const busy = sharing || emailingAttachment || recordingCompletion;
  const runShareAction = async (action: (selection: ProjectDataShareSelection) => void) => {
    if (actionInFlight.current || busy) { return; }
    actionInFlight.current = true;
    setRecordingCompletion(true);
    try {
      await onBeforeShare?.();
      await action(currentSelection);
    } catch (error) {
      Alert.alert('Could not update form status', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      actionInFlight.current = false;
      setRecordingCompletion(false);
    }
  };

  const toggleRecipient = (userId: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const addExternalEmail = () => {
    const email = normalizedEmail(externalEmailInput);
    if (!email || !EMAIL_PATTERN.test(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }

    if (email === ESS_SAFETY_EMAIL) {
      if (includeEssSafety) {
        setEmailError('That email is already included.');
      } else {
        setIncludeEssSafety(true);
        setExternalEmailInput('');
        setEmailError(null);
      }
      return;
    }

    if (externalEmails.includes(email)) {
      setEmailError('That email is already included.');
      return;
    }

    const matchingEmployee = availableRecipients.find(user => normalizedEmail(user.email) === email);
    if (matchingEmployee) {
      setSelectedIds(current => new Set(current).add(matchingEmployee.id));
      setExternalEmailInput('');
      setEmailError(null);
      return;
    }

    setExternalEmails(current => [...current, email]);
    setExternalEmailInput('');
    setEmailError(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={StyleSheet.absoluteFill}
          disabled={busy}
          onPress={onClose}
        />

        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Feather name="share-2" size={20} color={Colors.primary} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Share PDF</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close share"
              style={styles.closeButton}
              disabled={busy}
              onPress={onClose}>
              <Feather name="x" size={19} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Default recipient</Text>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{checked: includeEssSafety}}
            accessibilityLabel={`${includeEssSafety ? 'Remove' : 'Add'} ESS Safety`}
            style={[
              styles.lockedRecipientRow,
              !includeEssSafety ? styles.lockedRecipientRowExcluded : null,
            ]}
            onPress={() => setIncludeEssSafety(current => !current)}>
            <View style={styles.companyAvatar}>
              <Image
                source={{uri: '/scaffold-forms/logo.png'}}
                style={styles.companyLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.recipientTextWrap}>
              <Text style={styles.recipientName}>ESS Safety</Text>
              <Text style={styles.recipientEmail}>{ESS_SAFETY_EMAIL}</Text>
            </View>
            <View
              style={[
                styles.checkbox,
                includeEssSafety ? styles.checkboxSelected : null,
              ]}>
              {includeEssSafety ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
            </View>
          </TouchableOpacity>

          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionLabel}>ESS employees</Text>
            {selectedRecipients.length > 0 ? (
              <Text style={styles.selectionCount}>{selectedRecipients.length} selected</Text>
            ) : null}
          </View>

          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search employees"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          <View style={styles.listWrap}>
            {loadingRecipients ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : filteredRecipients.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No employees found.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredRecipients}
                keyExtractor={item => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({item}) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <TouchableOpacity
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: selected}}
                      accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${userLabel(item)}`}
                      style={[styles.recipientRow, selected ? styles.recipientRowSelected : null]}
                      onPress={() => toggleRecipient(item.id)}>
                      <RecipientAvatar user={item} styles={styles} />
                      <View style={styles.recipientTextWrap}>
                        <Text style={styles.recipientName} numberOfLines={1}>{userLabel(item)}</Text>
                        <Text style={styles.recipientEmail} numberOfLines={1}>
                          {item.email || 'No email recorded'}
                        </Text>
                      </View>
                      <View style={[styles.checkbox, selected ? styles.checkboxSelected : null]}>
                        {selected ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>

          <Text style={[styles.sectionLabel, styles.externalSectionLabel]}>External recipients</Text>
          <View style={[styles.emailInputRow, emailError ? styles.emailInputRowError : null]}>
            <Feather name="mail" size={16} color={theme.textSecondary} />
            <TextInput
              style={styles.emailInput}
              value={externalEmailInput}
              onChangeText={value => {
                setExternalEmailInput(value);
                if (emailError) {
                  setEmailError(null);
                }
              }}
              onSubmitEditing={addExternalEmail}
              placeholder="name@company.com"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Add external email"
              style={styles.addEmailButton}
              disabled={!externalEmailInput.trim() || busy}
              onPress={addExternalEmail}>
              <Feather name="plus" size={16} color={Colors.primary} />
              <Text style={styles.addEmailButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          {emailError ? <Text style={styles.emailError}>{emailError}</Text> : null}

          {externalEmails.length > 0 ? (
            <View style={styles.externalRecipientsWrap}>
              <View style={styles.externalRecipientsHeading}>
                <Text style={styles.externalRecipientsTitle}>Included external recipients</Text>
                <Text style={styles.externalRecipientsCount}>{externalEmails.length}</Text>
              </View>
              <ScrollView
                style={styles.externalRecipientsList}
                showsVerticalScrollIndicator={externalEmails.length > 2}
                keyboardShouldPersistTaps="handled">
                {externalEmails.map((email, index) => (
                  <View
                    key={email}
                    style={[
                      styles.externalRecipientRow,
                      index < externalEmails.length - 1
                        ? styles.externalRecipientRowBorder
                        : null,
                    ]}>
                    <Feather name="mail" size={15} color={Colors.primary} />
                    <Text style={styles.externalRecipientEmail} numberOfLines={1}>{email}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${email}`}
                      style={styles.removeExternalRecipientButton}
                      hitSlop={{top: 5, right: 5, bottom: 5, left: 5}}
                      onPress={() => setExternalEmails(current => current.filter(value => value !== email))}>
                      <Feather name="x" size={15} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Share PDF with ${totalRecipientCount} recipients`}
            style={[
              styles.shareButton,
              busy || totalRecipientCount === 0 ? styles.shareButtonDisabled : null,
            ]}
            disabled={busy || totalRecipientCount === 0}
            onPress={() => runShareAction(onShare)}>
            {sharing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="send" size={17} color="#FFFFFF" />
                <Text style={styles.shareButtonText}>
                  {totalRecipientCount === 0
                    ? 'Select a recipient'
                    : `Share with ${totalRecipientCount} recipient${totalRecipientCount === 1 ? '' : 's'}`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {onEmailAttachment ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Email PDF attachment to ${attachmentRecipientCount} recipients`}
              style={[
                styles.emailAttachmentButton,
                busy || attachmentRecipientCount === 0 ? styles.shareButtonDisabled : null,
              ]}
              disabled={busy || attachmentRecipientCount === 0}
              onPress={() => runShareAction(onEmailAttachment)}>
              {emailingAttachment ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Feather name="mail" size={17} color={Colors.primary} />
                  <Text style={styles.emailAttachmentButtonText}>
                    {attachmentRecipientCount === 0
                      ? 'Select an email recipient'
                      : 'Email PDF as attachment'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.48)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    card: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '90%',
      borderRadius: BorderRadius.lg,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      padding: Spacing.md,
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: {width: 0, height: 10},
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: Spacing.md,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: '#EAF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {flex: 1, minWidth: 0},
    title: {color: theme.text, fontSize: FontSize.lg, fontWeight: '800'},
    subtitle: {color: theme.textSecondary, fontSize: FontSize.sm, marginTop: 2},
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.md,
      marginBottom: 6,
    },
    sectionLabel: {
      color: theme.textSecondary,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    selectionCount: {color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700'},
    lockedRecipientRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: '#C9DBF7',
      backgroundColor: '#F3F7FD',
    },
    lockedRecipientRowExcluded: {
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    companyAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    companyLogo: {width: 34, height: 34},
    searchWrap: {
      minHeight: 42,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      marginBottom: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: theme.text,
      fontSize: FontSize.sm,
      paddingVertical: 0,
    },
    listWrap: {
      minHeight: 142,
      maxHeight: 230,
      flexShrink: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
    },
    centered: {
      minHeight: 142,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.md,
    },
    emptyText: {color: theme.textSecondary, fontSize: FontSize.sm},
    recipientRow: {
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
    },
    recipientRowSelected: {backgroundColor: '#F3F7FD'},
    recipientAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    recipientAvatarImage: {width: '100%', height: '100%'},
    recipientAvatarText: {color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '800'},
    recipientTextWrap: {flex: 1, minWidth: 0},
    recipientName: {color: theme.text, fontSize: FontSize.sm, fontWeight: '700'},
    recipientEmail: {color: theme.textSecondary, fontSize: FontSize.xs, marginTop: 3},
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    checkboxSelected: {backgroundColor: Colors.primary, borderColor: Colors.primary},
    externalSectionLabel: {marginTop: Spacing.md},
    emailInputRow: {
      minHeight: 44,
      paddingLeft: 12,
      paddingRight: 5,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    emailInputRowError: {borderColor: Colors.error},
    emailInput: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontSize: FontSize.sm,
      paddingVertical: 0,
    },
    addEmailButton: {
      height: 34,
      borderRadius: 8,
      paddingHorizontal: 10,
      backgroundColor: '#EAF2FF',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    addEmailButtonText: {color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800'},
    emailError: {color: Colors.error, fontSize: FontSize.xs, marginTop: 5},
    externalRecipientsWrap: {
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    externalRecipientsHeading: {
      minHeight: 32,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    externalRecipientsTitle: {
      color: theme.textSecondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.35,
      textTransform: 'uppercase',
    },
    externalRecipientsCount: {
      color: Colors.primary,
      fontSize: FontSize.xs,
      fontWeight: '800',
    },
    externalRecipientsList: {maxHeight: 100},
    externalRecipientRow: {
      minHeight: 42,
      paddingLeft: 12,
      paddingRight: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    externalRecipientRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    externalRecipientEmail: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontSize: FontSize.sm,
    },
    removeExternalRecipientButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareButton: {
      minHeight: 48,
      marginTop: Spacing.md,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
    },
    shareButtonDisabled: {opacity: 0.55},
    shareButtonText: {color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '800'},
    emailAttachmentButton: {
      minHeight: 48,
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: theme.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
    },
    emailAttachmentButtonText: {
      color: Colors.primary,
      fontSize: FontSize.sm,
      fontWeight: '800',
    },
  });
}
