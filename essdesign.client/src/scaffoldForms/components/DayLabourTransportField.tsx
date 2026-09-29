// Derived from ESSApp/src/components/DayLabourTransportField.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {Modal, Pressable, StyleSheet, Text, TextInput, View} from '../browser/runtime';
import Feather from '../browser/Feather';

const TRANSPORT_OPTIONS = ['3T Truck - $400', '12T Truck - $800'] as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  compact?: boolean;
};

export default function DayLabourTransportField({value, onChange, readOnly = false, compact = false}: Props) {
  const [open, setOpen] = React.useState(false);
  const [customSelected, setCustomSelected] = React.useState(false);
  const isPreset = TRANSPORT_OPTIONS.some(option => option === value);
  const isCustom = customSelected || (!!value && !isPreset);
  const choose = (option: string) => {
    if (readOnly) { return; }
    setOpen(false);
    setCustomSelected(option === 'Custom');
    if (option === 'Custom') {
      if (isPreset) { onChange(''); }
    } else {
      onChange(option);
    }
  };
  return (
    <View style={styles.container}>
      <View style={[styles.field, compact && styles.compactField]}>
        {isCustom ? (
          <TextInput
            accessibilityLabel="Custom transport included"
            editable={!readOnly}
            value={value}
            onChangeText={onChange}
            placeholder="Enter custom transport"
            placeholderTextColor="#777777"
            style={[styles.input, compact && styles.compactText]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Transport included selection"
            disabled={readOnly}
            onPress={() => setOpen(true)}
            style={styles.selection}>
            <Text style={[styles.text, compact && styles.compactText]} numberOfLines={1}>{value || 'Select transport'}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose transport option"
          accessibilityState={{expanded: open, disabled: readOnly}}
          disabled={readOnly}
          onPress={() => setOpen(true)}
          style={styles.arrow}>
          <Feather name="chevron-down" size={compact ? 16 : 20} color="#222222" />
        </Pressable>
      </View>
      <Modal visible={open && !readOnly} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close transport options">
          <View style={styles.menu}>
            <Text style={styles.title}>Transport Included</Text>
            {[...TRANSPORT_OPTIONS, 'Custom'].map(option => (
              <Pressable key={option} accessibilityRole="button" accessibilityLabel={option} onPress={() => choose(option)} style={styles.option}>
                <Text style={styles.text}>{option}</Text>
                {(option === 'Custom' ? isCustom : value === option) && <Feather name="check" size={20} color="#222222" />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, minWidth: 0},
  field: {minHeight: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderColor: '#333333', backgroundColor: '#F2F2F2'},
  compactField: {minHeight: 32, height: 32},
  input: {flex: 1, minWidth: 0, color: '#222222', fontSize: 15, paddingHorizontal: 7, paddingVertical: 0},
  selection: {flex: 1, minWidth: 0, paddingHorizontal: 7, alignSelf: 'stretch', justifyContent: 'center'},
  text: {color: '#222222', fontSize: 15},
  compactText: {fontSize: 13},
  arrow: {alignSelf: 'stretch', paddingHorizontal: 5, justifyContent: 'center'},
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24},
  menu: {width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16},
  title: {color: '#111111', fontSize: 18, fontWeight: '700', marginBottom: 8},
  option: {minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDDDDD'},
});
