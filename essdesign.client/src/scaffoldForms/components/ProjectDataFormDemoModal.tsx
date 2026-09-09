// Derived from ESSApp/src/components/ProjectDataFormDemoModal.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from '../browser/runtime';
import Feather from '../browser/Feather';
import {Colors} from '../theme/appTheme';

type Props = {
  visible: boolean;
  variant: 'handover' | 'day-labour';
  formNumber?: string;
  referenceName?: string;
  representativeName?: string;
  showDontShowAgain?: boolean;
  onDontShowAgain?: () => void;
  onClose: () => void;
};

const STEP_LABELS = [
  'Preparing form',
  'Completing form',
  'Saving form',
  'Form saved',
  'Opening Share',
  'Selecting company members',
  'Sharing PDF',
  'Shared successfully',
];

function DemoRecipientRow({
  initials,
  name,
  email,
  selection,
}: {
  initials: string;
  name: string;
  email: string;
  selection: Animated.Value;
}) {
  return (
    <View style={styles.employeeRow}>
      <View style={styles.employeeAvatar}>
        <Text style={styles.employeeAvatarText}>{initials}</Text>
      </View>
      <View style={styles.shareRecipientCopy}>
        <Text style={styles.shareRecipientName} numberOfLines={1}>{name}</Text>
        <Text style={styles.shareRecipientEmail} numberOfLines={1}>{email}</Text>
      </View>
      <View style={styles.shareCheckbox}>
        <Animated.View
          style={[
            styles.animatedCheckboxFill,
            {
              opacity: selection,
              transform: [{scale: selection}],
            },
          ]}>
          <Feather name="check" size={11} color="#FFFFFF" />
        </Animated.View>
      </View>
    </View>
  );
}

export default function ProjectDataFormDemoModal({
  visible,
  variant,
  formNumber,
  referenceName,
  representativeName,
  showDontShowAgain = false,
  onDontShowAgain,
  onClose,
}: Props) {
  const isIPad = Platform.OS === 'ios' && Platform.isPad;
  const {width: viewportWidth, height: viewportHeight} = useWindowDimensions();
  const iPadModalScale = Math.min(
    1.2,
    (viewportWidth - 72) / 440,
    (viewportHeight - 72) / 620,
  );
  const [step, setStep] = React.useState(0);
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const panelScale = React.useRef(new Animated.Value(0.88)).current;
  const panelTranslate = React.useRef(new Animated.Value(18)).current;
  const fieldAnimations = React.useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const saveScale = React.useRef(new Animated.Value(1)).current;
  const saveGlow = React.useRef(new Animated.Value(0)).current;
  const savedOpacity = React.useRef(new Animated.Value(0)).current;
  const shareScale = React.useRef(new Animated.Value(1)).current;
  const shareGlow = React.useRef(new Animated.Value(0)).current;
  const shareSheetOpacity = React.useRef(new Animated.Value(0)).current;
  const shareSheetScale = React.useRef(new Animated.Value(0.9)).current;
  const shareSheetTranslate = React.useRef(new Animated.Value(18)).current;
  const recipientOneSelected = React.useRef(new Animated.Value(0)).current;
  const recipientTwoSelected = React.useRef(new Animated.Value(0)).current;
  const sendScale = React.useRef(new Animated.Value(1)).current;
  const successScale = React.useRef(new Animated.Value(0.7)).current;
  const successOpacity = React.useRef(new Animated.Value(0)).current;
  const stopAnimationRef = React.useRef<() => void>(() => {});

  const playAnimation = React.useCallback(() => {
    stopAnimationRef.current();
    overlayOpacity.setValue(0);
    panelScale.setValue(0.88);
    panelTranslate.setValue(18);
    fieldAnimations.forEach(animation => animation.setValue(0));
    saveScale.setValue(1);
    saveGlow.setValue(0);
    savedOpacity.setValue(0);
    shareScale.setValue(1);
    shareGlow.setValue(0);
    shareSheetOpacity.setValue(0);
    shareSheetScale.setValue(0.9);
    shareSheetTranslate.setValue(18);
    recipientOneSelected.setValue(0);
    recipientTwoSelected.setValue(0);
    sendScale.setValue(1);
    successScale.setValue(0.7);
    successOpacity.setValue(0);
    setStep(0);

    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 1300),
      setTimeout(() => setStep(3), 1800),
      setTimeout(() => setStep(4), 2200),
      setTimeout(() => setStep(5), 2650),
      setTimeout(() => setStep(6), 3400),
      setTimeout(() => setStep(7), 3950),
    ];

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(panelScale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(panelTranslate, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(
        170,
        fieldAnimations.map(field => Animated.timing(field, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })),
      ),
      Animated.delay(160),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(saveScale, {
            toValue: 0.9,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.timing(saveScale, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(saveGlow, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.timing(saveGlow, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.timing(savedOpacity, {
        toValue: 1,
        duration: 190,
        useNativeDriver: true,
      }),
      Animated.delay(180),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shareScale, {
            toValue: 0.9,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.timing(shareScale, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(shareGlow, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.timing(shareGlow, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(shareSheetOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(shareSheetScale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(shareSheetTranslate, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(180),
      Animated.timing(recipientOneSelected, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(100),
      Animated.timing(recipientTwoSelected, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(180),
      Animated.sequence([
        Animated.timing(sendScale, {
          toValue: 0.94,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(sendScale, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(successScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start();
    const cleanup = () => {
      animation.stop();
      timers.forEach(clearTimeout);
    };
    stopAnimationRef.current = cleanup;
    return cleanup;
  }, [
    fieldAnimations,
    overlayOpacity,
    panelScale,
    panelTranslate,
    recipientOneSelected,
    recipientTwoSelected,
    savedOpacity,
    saveGlow,
    saveScale,
    sendScale,
    shareSheetOpacity,
    shareSheetScale,
    shareSheetTranslate,
    shareGlow,
    shareScale,
    successOpacity,
    successScale,
  ]);

  React.useEffect(() => {
    if (!visible) {
      return undefined;
    }
    return playAnimation();
  }, [playAnimation, visible]);

  const isHandover = variant === 'handover';
  const cleanNumber = (formNumber || '-').replace(/^A\s*/i, '');
  const fields = isHandover
    ? [
        ['Form reference', referenceName || 'Scaffold access'],
        ['Inspection no.', `A${cleanNumber}`],
        ['ESS representative', representativeName || 'ESS Representative'],
        ['Safety checklist', 'Completed'],
      ]
    : [
        ['Form reference', referenceName || 'Variation works'],
        ['Variation no.', `A${cleanNumber}`],
        ['ESS representative', representativeName || 'ESS Representative'],
        ['Labour & materials', 'Completed'],
      ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, {opacity: overlayOpacity}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.modalCard,
            isIPad ? styles.ipadModalCard : null,
            {
              opacity: overlayOpacity,
              transform: [
                {
                  scale: isIPad
                    ? panelScale.interpolate({
                        inputRange: [0.88, 1],
                        outputRange: [iPadModalScale * 0.88, iPadModalScale],
                      })
                    : panelScale,
                },
                {translateY: panelTranslate},
              ],
            },
          ]}>
          <Pressable onPress={event => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.eyebrow}>HOW IT WORKS</Text>
                <Text style={styles.modalTitle}>
                  {isHandover ? 'Share a Handover' : 'Share Day Labour'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close sharing demonstration"
                style={styles.closeButton}
                onPress={onClose}>
                <Feather name="x" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={styles.stageLabelWrap}>
              <View style={[styles.stageDot, step === 7 ? styles.stageDotComplete : null]} />
              <Text style={styles.stageLabel}>{STEP_LABELS[step]}</Text>
            </View>

            <View style={styles.demoStage}>
              <View style={styles.documentSheet}>
                <View style={styles.documentHeader}>
                  <Image
                    source={{uri: '/scaffold-forms/logo.png'}}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                  <View style={styles.documentHeaderCopy}>
                    <Text style={styles.documentTitle}>
                      {isHandover ? 'ESS HANDOVER CERTIFICATE' : 'ESS VARIATION / DAY LABOUR'}
                    </Text>
                    <Text style={styles.documentNumber}>
                      {isHandover ? 'INSPECTION' : 'VARIATION'} NO. A{cleanNumber}
                    </Text>
                  </View>
                </View>

                <View style={styles.documentRule} />
                <View style={styles.documentBand}>
                  <Text style={styles.documentBandText}>FORM DETAILS</Text>
                </View>

                <View style={styles.fieldsWrap}>
                  {fields.map(([label, value], index) => {
                    const fieldAnimation = fieldAnimations[index];
                    return (
                      <View key={label} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{label}</Text>
                        <View style={styles.fieldValueLine}>
                          <Animated.Text
                            numberOfLines={1}
                            style={[
                              styles.fieldValue,
                              {
                                opacity: fieldAnimation,
                                transform: [{
                                  translateX: fieldAnimation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-8, 0],
                                  }),
                                }],
                              },
                            ]}>
                            {value}
                          </Animated.Text>
                        </View>
                        <Animated.View
                          style={[
                            styles.fieldTick,
                            {
                              opacity: fieldAnimation,
                              transform: [{scale: fieldAnimation}],
                            },
                          ]}>
                          <Feather name="check" size={10} color="#FFFFFF" />
                        </Animated.View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.documentBand}>
                  <Text style={styles.documentBandText}>
                    {isHandover ? 'CERTIFICATION' : 'AUTHORISATION'}
                  </Text>
                </View>
                <View style={styles.signatureRow}>
                  <View style={styles.signatureLine} />
                  <View style={styles.signatureLine} />
                </View>
              </View>

              <View style={styles.formActions}>
                <View style={styles.formActionSlot}>
                  <Animated.View
                    style={[
                      styles.actionGlow,
                      {
                        opacity: saveGlow,
                        transform: [{scale: saveGlow.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.45],
                        })}],
                      },
                    ]}
                  />
                  <Animated.View style={[styles.saveButton, {transform: [{scale: saveScale}]}]}>
                    <Feather name="save" size={15} color="#FFFFFF" />
                    <Text style={styles.formActionText}>Save</Text>
                  </Animated.View>
                  <Animated.View style={[styles.savedPill, {opacity: savedOpacity}]}>
                    <Feather name="check" size={10} color="#0B7A45" />
                    <Text style={styles.savedPillText}>Saved</Text>
                  </Animated.View>
                </View>

                <View style={styles.formActionSlot}>
                  <Animated.View
                    style={[
                      styles.actionGlow,
                      {
                        opacity: shareGlow,
                        transform: [{scale: shareGlow.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.45],
                        })}],
                      },
                    ]}
                  />
                  <Animated.View style={[styles.shareButton, {transform: [{scale: shareScale}]}]}>
                    <Feather name="share-2" size={15} color="#FFFFFF" />
                    <Text style={styles.formActionText}>Share</Text>
                  </Animated.View>
                </View>
              </View>

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.shareSheetBackdrop,
                  {opacity: shareSheetOpacity},
                ]}>
                <Animated.View
                  style={[
                    styles.shareSheet,
                    {
                      transform: [
                        {scale: shareSheetScale},
                        {translateY: shareSheetTranslate},
                      ],
                    },
                  ]}>
                  <View style={styles.shareSheetHeader}>
                    <View style={styles.shareSheetIcon}>
                      <Feather name="share-2" size={15} color={Colors.primary} />
                    </View>
                    <View style={styles.shareSheetHeaderCopy}>
                      <Text style={styles.shareSheetTitle}>Share PDF</Text>
                      <Text style={styles.shareSheetSubtitle} numberOfLines={1}>
                        {referenceName || (isHandover ? 'Handover Certificate' : 'Day Labour / Variation')}
                      </Text>
                    </View>
                    <View style={styles.shareSheetClose}>
                      <Feather name="x" size={13} color="#64748B" />
                    </View>
                  </View>

                  <Text style={styles.shareSectionLabel}>DEFAULT RECIPIENT</Text>
                  <View style={[styles.shareRecipientRow, styles.defaultRecipientRow]}>
                    <View style={styles.companyAvatar}>
                      <Image
                        source={{uri: '/scaffold-forms/logo.png'}}
                        style={styles.companyLogo}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.shareRecipientCopy}>
                      <Text style={styles.shareRecipientName}>ESS Safety</Text>
                      <Text style={styles.shareRecipientEmail}>erinr@erectsafe.com.au</Text>
                    </View>
                    <View style={[styles.shareCheckbox, styles.shareCheckboxSelected]}>
                      <Feather name="check" size={11} color="#FFFFFF" />
                    </View>
                  </View>

                  <View style={styles.employeeHeading}>
                    <Text style={styles.shareSectionLabel}>ESS EMPLOYEES</Text>
                    <Text style={styles.selectedCount}>{step >= 6 ? '2 selected' : 'Select members'}</Text>
                  </View>
                  <View style={styles.shareSearch}>
                    <Feather name="search" size={12} color="#94A3B8" />
                    <Text style={styles.shareSearchText}>Search employees</Text>
                  </View>

                  <View style={styles.employeeList}>
                    <DemoRecipientRow
                      initials="PA"
                      name="Project Administrator"
                      email="projects@company.com"
                      selection={recipientOneSelected}
                    />
                    <DemoRecipientRow
                      initials="SS"
                      name="Site Supervisor"
                      email="supervisor@company.com"
                      selection={recipientTwoSelected}
                    />
                  </View>

                  <Animated.View style={[styles.sendButton, {transform: [{scale: sendScale}]}]}>
                    <Feather name="send" size={13} color="#FFFFFF" />
                    <Text style={styles.sendButtonText}>Share with 3 recipients</Text>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.shareSuccessOverlay,
                      {
                        opacity: successOpacity,
                        transform: [{scale: successScale}],
                      },
                    ]}>
                    <View style={styles.successIcon}>
                      <Feather name="check" size={25} color="#FFFFFF" />
                    </View>
                    <Text style={styles.shareSuccessTitle}>Shared successfully</Text>
                    <Text style={styles.shareSuccessCopy}>The PDF was sent to selected company members.</Text>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.replayButton} onPress={playAnimation}>
                <Feather name="refresh-cw" size={14} color={Colors.primary} />
                <Text style={styles.replayText}>Replay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                <Text style={styles.doneText}>Got it</Text>
              </TouchableOpacity>
            </View>
            {showDontShowAgain && onDontShowAgain ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Do not show this walkthrough again"
                style={styles.dontShowButton}
                onPress={onDontShowAgain}>
                <View style={styles.dontShowIcon}>
                  <Feather name="eye-off" size={13} color="#64748B" />
                </View>
                <Text style={styles.dontShowText}>Don&apos;t show this again</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.demoDisclaimer}>Demonstration only — nothing is sent.</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 12},
    elevation: 12,
  },
  ipadModalCard: {
    maxWidth: 440,
    padding: 22,
    borderRadius: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLabelWrap: {
    height: 30,
    marginTop: 12,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  stageDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F28C20',
  },
  stageDotComplete: {backgroundColor: '#0B7A45'},
  stageLabel: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  demoStage: {
    marginTop: 12,
    minHeight: 344,
    borderRadius: 18,
    backgroundColor: '#F3F6F8',
    padding: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  documentSheet: {
    width: 220,
    minHeight: 224,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    padding: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  logo: {width: 67, height: 27},
  documentHeaderCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  documentTitle: {
    color: '#111827',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    textAlign: 'right',
  },
  documentNumber: {
    color: '#EF2B1F',
    fontSize: 6.5,
    lineHeight: 9,
    fontWeight: '900',
    marginTop: 4,
  },
  documentRule: {
    height: 1,
    backgroundColor: '#1F2937',
    marginTop: 8,
    marginBottom: 5,
  },
  documentBand: {
    height: 17,
    backgroundColor: '#F28C20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentBandText: {
    color: '#1F2937',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
  },
  fieldsWrap: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#CBD5E1',
  },
  fieldRow: {
    height: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldLabel: {
    width: 66,
    color: '#64748B',
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  fieldValueLine: {
    flex: 1,
    minWidth: 0,
    height: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#94A3B8',
    justifyContent: 'center',
  },
  fieldValue: {
    color: '#0F172A',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
  },
  fieldTick: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#0B7A45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureRow: {
    height: 33,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  signatureLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#64748B',
  },
  formActions: {
    height: 52,
    marginTop: -8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
  },
  formActionSlot: {
    width: 100,
    height: 48,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionGlow: {
    position: 'absolute',
    bottom: 1,
    width: 82,
    height: 34,
    borderRadius: 18,
    backgroundColor: 'rgba(11, 122, 69, 0.25)',
  },
  saveButton: {
    minWidth: 94,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  shareButton: {
    minWidth: 94,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: Colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
  },
  formActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  savedPill: {
    position: 'absolute',
    top: -5,
    height: 21,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  savedPillText: {
    color: '#0B7A45',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
  },
  shareSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  shareSheet: {
    width: '100%',
    maxWidth: 294,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 11,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 8,
    overflow: 'hidden',
  },
  shareSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
  },
  shareSheetIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  shareSheetTitle: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  shareSheetSubtitle: {
    color: '#64748B',
    fontSize: 8,
    lineHeight: 11,
    marginTop: 1,
  },
  shareSheetClose: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSectionLabel: {
    color: '#64748B',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  shareRecipientRow: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  defaultRecipientRow: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9DBF7',
    backgroundColor: '#F3F7FD',
  },
  companyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  companyLogo: {width: 24, height: 19},
  shareRecipientCopy: {
    flex: 1,
    minWidth: 0,
  },
  shareRecipientName: {
    color: '#0F172A',
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
  },
  shareRecipientEmail: {
    color: '#64748B',
    fontSize: 7,
    lineHeight: 9,
    marginTop: 1,
  },
  shareCheckbox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shareCheckboxSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  animatedCheckboxFill: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeHeading: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCount: {
    color: Colors.primary,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
  },
  shareSearch: {
    height: 28,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareSearchText: {
    color: '#94A3B8',
    fontSize: 8,
    lineHeight: 10,
  },
  employeeList: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  employeeRow: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  employeeAvatar: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeAvatarText: {
    color: '#FFFFFF',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
  },
  sendButton: {
    height: 34,
    marginTop: 8,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
  },
  shareSuccessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0B7A45',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  shareSuccessTitle: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  shareSuccessCopy: {
    color: '#64748B',
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 9,
  },
  replayButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#B9D5C7',
    backgroundColor: '#F2F8F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  replayText: {
    color: Colors.primary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  doneButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  dontShowButton: {
    alignSelf: 'center',
    minHeight: 32,
    marginTop: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dontShowIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dontShowText: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  demoDisclaimer: {
    color: '#94A3B8',
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    marginTop: 9,
  },
});
