// Derived from ESSApp/src/components/ScaffoldRecordLinkControls.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from '../browser/runtime';
import Feather from '../browser/Feather';
import {Colors} from '../theme/appTheme';

export type ScaffoldLinkPickerItem = {
  id: string;
  title: string;
  subtitle: string;
  reference: string;
  searchText: string;
};

type LinkBannerProps = {
  variant: 'suggestion' | 'linked';
  eyebrow: string;
  title: string;
  subtitle: string;
  onPrimary: () => void;
  onBrowse: () => void;
  onDismiss?: () => void;
  topOffset?: number;
};

export function ScaffoldRecordLinkBanner({
  variant,
  eyebrow,
  title,
  subtitle,
  onPrimary,
  onBrowse,
  onDismiss,
  topOffset = 10,
}: LinkBannerProps) {
  const linked = variant === 'linked';
  return (
    <View style={[
      styles.banner,
      {top: topOffset},
      linked ? styles.linkedBanner : styles.suggestionBanner,
    ]}>
      <View style={[styles.bannerIcon, linked ? styles.linkedIcon : styles.suggestionIcon]}>
        <Feather name={linked ? 'link-2' : 'zap'} size={17} color="#FFFFFF" />
      </View>
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerEyebrow}>{eyebrow}</Text>
        <Text style={styles.bannerTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.bannerSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <View style={styles.bannerActions}>
        <TouchableOpacity style={styles.primaryPill} onPress={onPrimary}>
          <Text style={styles.primaryPillText}>{linked ? 'Open' : 'Link'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryPill} onPress={onBrowse}>
          <Text style={styles.secondaryPillText}>{linked ? 'Change' : 'Browse'}</Text>
        </TouchableOpacity>
      </View>
      {!linked && onDismiss ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Dismiss link suggestion"
          style={styles.dismissButton}
          onPress={onDismiss}>
          <Feather name="x" size={14} color="#64748B" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type PickerProps = {
  visible: boolean;
  title: string;
  emptyText: string;
  items: ScaffoldLinkPickerItem[];
  selectedId?: string;
  onSelect: (item: ScaffoldLinkPickerItem) => void;
  onClear?: () => void;
  onClose: () => void;
};

export function ScaffoldRecordLinkPickerModal({
  visible,
  title,
  emptyText,
  items,
  selectedId,
  onSelect,
  onClear,
  onClose,
}: PickerProps) {
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!visible) {
      setQuery('');
    }
  }, [visible]);

  const filteredItems = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter(item => item.searchText.toLowerCase().includes(normalized));
  }, [items, query]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>PROJECT REGISTER</Text>
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Feather name="x" size={20} color="#334155" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search scaffold name or reference"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <ScrollView style={styles.results} contentContainerStyle={styles.resultsContent}>
            {filteredItems.length ? filteredItems.map(item => {
              const selected = item.id === selectedId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.resultRow, selected ? styles.resultRowSelected : null]}
                  onPress={() => onSelect(item)}>
                  <View style={[styles.resultIcon, selected ? styles.resultIconSelected : null]}>
                    <Feather name={selected ? 'check' : 'layers'} size={16} color={selected ? '#FFFFFF' : Colors.primary} />
                  </View>
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                  <Text style={styles.resultReference}>{item.reference}</Text>
                </TouchableOpacity>
              );
            }) : (
              <View style={styles.emptyState}>
                <Feather name="inbox" size={25} color="#94A3B8" />
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            )}
          </ScrollView>
          {selectedId && onClear ? (
            <TouchableOpacity style={styles.clearLinkButton} onPress={onClear}>
              <Feather name="unlink" size={15} color="#B42318" />
              <Text style={styles.clearLinkText}>Remove current link</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
    minHeight: 78,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 11,
    paddingRight: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 7},
    elevation: 8,
  },
  suggestionBanner: {backgroundColor: '#FFF7E8', borderColor: '#F6C66B'},
  linkedBanner: {backgroundColor: '#ECF8F1', borderColor: '#9FD5B7'},
  bannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suggestionIcon: {backgroundColor: '#E98B17'},
  linkedIcon: {backgroundColor: '#0B7A45'},
  bannerCopy: {flex: 1, minWidth: 0},
  bannerEyebrow: {fontSize: 8, lineHeight: 10, fontWeight: '900', color: '#64748B', letterSpacing: 0.7},
  bannerTitle: {fontSize: 13, lineHeight: 17, fontWeight: '900', color: '#0F172A'},
  bannerSubtitle: {fontSize: 10, lineHeight: 13, fontWeight: '600', color: '#64748B', marginTop: 1},
  bannerActions: {gap: 5, marginLeft: 8},
  primaryPill: {minWidth: 54, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10},
  primaryPillText: {fontSize: 10, fontWeight: '900', color: '#FFFFFF'},
  secondaryPill: {minWidth: 54, height: 25, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8},
  secondaryPillText: {fontSize: 9, fontWeight: '800', color: '#475569'},
  dismissButton: {position: 'absolute', top: -5, right: -4, width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 20},
  modalCard: {width: '100%', maxWidth: 560, maxHeight: '78%', borderRadius: 24, backgroundColor: '#FFFFFF', padding: 16, shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: {width: 0, height: 12}, elevation: 12},
  modalHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  modalEyebrow: {fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8, color: Colors.primary},
  modalTitle: {fontSize: 20, lineHeight: 25, fontWeight: '900', color: '#0F172A', marginTop: 2},
  closeButton: {width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center'},
  searchBox: {height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D7DEE8', backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12},
  searchInput: {flex: 1, color: '#0F172A', fontSize: 13, paddingVertical: 0},
  results: {marginTop: 12},
  resultsContent: {gap: 8, paddingBottom: 4},
  resultRow: {minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 9},
  resultRowSelected: {borderColor: '#7AC49D', backgroundColor: '#F0FAF5'},
  resultIcon: {width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF4EF', alignItems: 'center', justifyContent: 'center', marginRight: 9},
  resultIconSelected: {backgroundColor: '#0B7A45'},
  resultCopy: {flex: 1, minWidth: 0},
  resultTitle: {fontSize: 13, lineHeight: 17, fontWeight: '800', color: '#0F172A'},
  resultSubtitle: {fontSize: 10, lineHeight: 13, fontWeight: '600', color: '#64748B', marginTop: 2},
  resultReference: {fontSize: 10, lineHeight: 13, fontWeight: '900', color: Colors.primary, marginLeft: 8},
  emptyState: {paddingVertical: 34, alignItems: 'center', gap: 9},
  emptyText: {fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#64748B', textAlign: 'center'},
  clearLinkButton: {height: 40, marginTop: 12, borderRadius: 12, backgroundColor: '#FFF1F0', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center'},
  clearLinkText: {fontSize: 12, fontWeight: '800', color: '#B42318'},
});
