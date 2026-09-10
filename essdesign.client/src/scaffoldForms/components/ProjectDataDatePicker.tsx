// Derived from ESSApp/src/components/ProjectDataDatePicker.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../browser/runtime';
import Feather from '../browser/Feather';
import { BorderRadius, FontSize, Spacing, getTheme } from '../theme/appTheme';
import { usePreferences } from '../context/PreferencesContext';

type Props = {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};
export default function ProjectDataDatePicker({
  visible,
  value,
  onChange,
  onClose,
}: Props) {
  const prefs = usePreferences(),
    theme = getTheme(prefs.themeMode);
  const [month, setMonth] = React.useState(new Date());
  React.useEffect(() => {
    if (visible) {
      const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const date = match
        ? new Date(Number(match[3]), Number(match[2]) - 1, 1)
        : new Date();
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [visible, value]);
  const cells: Array<number | null> = Array(
    new Date(month.getFullYear(), month.getMonth(), 1).getDay(),
  ).fill(null);
  for (
    let i = 1;
    i <= new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    i++
  ) {
    cells.push(i);
  }
  while (cells.length % 7) {
    cells.push(null);
  }
  const styles = StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.lg,
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
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    calendarTitle: {
      fontSize: FontSize.md,
      fontWeight: '800',
      color: theme.text,
    },
    calendarNavButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarWeekRow: { flexDirection: 'row', marginBottom: 6 },
    calendarWeekDay: {
      flex: 1,
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: FontSize.xs,
      fontWeight: '800',
    },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarDayCell: {
      width: '14.2857%',
      aspectRatio: 1,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarDayText: {
      fontSize: FontSize.sm,
      fontWeight: '800',
      color: theme.text,
    },
  });
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              accessibilityLabel="Previous month"
              style={styles.calendarNavButton}
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <Feather name="chevron-left" size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.calendarTitle}>
              {month.toLocaleString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <TouchableOpacity
              accessibilityLabel="Next month"
              style={styles.calendarNavButton}
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <Feather name="chevron-right" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarWeekRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <Text key={i} style={styles.calendarWeekDay}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((day, i) => (
              <TouchableOpacity
                key={i}
                accessibilityLabel={
                  day
                    ? `${day}/${month.getMonth() + 1}/${month.getFullYear()}`
                    : undefined
                }
                disabled={day === null}
                style={styles.calendarDayCell}
                onPress={() => {
                  if (day !== null) {
                    onChange(
                      `${String(day).padStart(2, '0')}/${String(
                        month.getMonth() + 1,
                      ).padStart(2, '0')}/${month.getFullYear()}`,
                    );
                    onClose();
                  }
                }}
              >
                <Text style={styles.calendarDayText}>{day ?? ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
