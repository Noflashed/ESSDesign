// Derived from ESSApp/src/components/CompanyEntitySelector.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../browser/runtime';
import Feather from '../browser/Feather';
import {
  COMPANY_ENTITY_OPTIONS,
  CompanyEntityId,
  companyFormTitle,
  getCompanyEntity,
} from '../config/companyEntities';
import {BorderRadius, Colors, FontSize, Spacing, getTheme} from '../theme/appTheme';

type Props = {
  entityId: CompanyEntityId;
  formName: string;
  theme: ReturnType<typeof getTheme>;
  disabled?: boolean;
  onChange: (entityId: CompanyEntityId) => void;
};

export default function CompanyEntitySelector({
  entityId,
  formName,
  theme,
  disabled = false,
  onChange,
}: Props) {
  const [visible, setVisible] = React.useState(false);
  const company = getCompanyEntity(entityId);
  const useCompactTitle = Platform.OS === 'ios' && !Platform.isPad;
  const styles = React.useMemo(() => makeStyles(theme), [theme]);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Change company. Currently ${company.shortName}`}
        activeOpacity={0.75}
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={styles.titleButton}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={styles.titleText}>
          {useCompactTitle ? company.shortName : companyFormTitle(company.id, formName)}
        </Text>
        {!disabled ? <Feather name="chevron-down" size={15} color={theme.textSecondary} /> : null}
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.card} onPress={event => event.stopPropagation()}>
            <Text style={styles.modalTitle}>Select company</Text>
            <Text style={styles.modalSubtitle}>This changes the branding on the form and saved PDF.</Text>
            <View style={styles.options}>
              {COMPANY_ENTITY_OPTIONS.map(option => {
                const selected = option.id === entityId;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.78}
                    style={[styles.option, selected ? styles.optionSelected : null]}
                    onPress={() => {
                      onChange(option.id);
                      setVisible(false);
                    }}>
                    <Image source={option.logo} style={styles.logo} resizeMode="contain" />
                    <View style={styles.optionText}>
                      <Text style={styles.optionName}>{option.legalName}</Text>
                      <Text style={styles.optionAbn}>ABN {option.abn}</Text>
                    </View>
                    <View style={[styles.radio, selected ? styles.radioSelected : null]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    titleButton: {
      maxWidth: '100%',
      minHeight: 40,
      paddingHorizontal: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    titleText: {
      flexShrink: 1,
      color: theme.text,
      fontSize: FontSize.lg,
      fontWeight: '700',
      textAlign: 'center',
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.48)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 520,
      padding: Spacing.lg,
      borderRadius: BorderRadius.lg,
      backgroundColor: theme.card,
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: {width: 0, height: 12},
      elevation: 10,
    },
    modalTitle: {color: theme.text, fontSize: FontSize.xl, fontWeight: '800'},
    modalSubtitle: {color: theme.textSecondary, fontSize: FontSize.sm, marginTop: 5, lineHeight: 19},
    options: {marginTop: Spacing.lg, gap: Spacing.sm},
    option: {
      minHeight: 82,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    optionSelected: {borderColor: Colors.primary, backgroundColor: `${Colors.primary}0F`},
    logo: {width: 76, height: 48},
    optionText: {flex: 1},
    optionName: {color: theme.text, fontSize: FontSize.md, fontWeight: '700'},
    optionAbn: {color: theme.textSecondary, fontSize: FontSize.sm, marginTop: 4},
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {borderColor: Colors.primary},
    radioDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary},
    cancelButton: {alignSelf: 'flex-end', marginTop: Spacing.lg, paddingHorizontal: 10, paddingVertical: 8},
    cancelText: {color: theme.textSecondary, fontSize: FontSize.md, fontWeight: '700'},
  });
}
