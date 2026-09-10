// Derived from ESSApp/src/components/PreStartDocumentEditor.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import {
  PRE_START_EDITOR_WIDTH,
  PRE_START_EDITOR_HEIGHTS,
  preStartEditorPages,
} from '../models/preStartEditorLayout';
import ProjectDataDatePicker from './ProjectDataDatePicker';
import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from '../browser/runtime';
import { useSafeAreaInsets } from '../browser/safeArea';
import Svg, { Polyline } from '../browser/svg';
import Feather from '../browser/Feather';
import { getCompanyEntity } from '../config/companyEntities';
import { PreStartForm } from '../models/preStart';
import {
  PreStartDocumentNode,
  preStartDocumentValue,
} from '../models/preStartDocument';

type Props = {
  form: PreStartForm;
  disabled: boolean;
  numberPreview: string;
  photoUrls: Record<number, string>;
  onUpdate: (key: string, value: string | boolean | null) => void;
  onPhoto: (slot: number) => void;
  onSignature: (index: number) => void;
  onChecklistYesToAll: () => void;
};
export default function PreStartDocumentEditor({
  form,
  disabled,
  numberPreview,
  photoUrls,
  onUpdate,
  onPhoto,
  onSignature,
  onChecklistYesToAll,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pagerSize, setPagerSize] = React.useState({ width: 0, height: 0 });
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const company = getCompanyEntity(form.companyEntityId);
  const pages = React.useMemo(() => preStartEditorPages(company), [company]);
  const viewportWidth = Math.max(1, pagerSize.width || width);
  const availableHeight = Math.max(
    180,
    pagerSize.height || height - insets.top - insets.bottom - 112,
  );
  const visibleHeight = Math.max(180, availableHeight - 64 - insets.bottom);
  const renderNode = (node: PreStartDocumentNode, i: number) => {
    const position = {
      position: 'absolute' as const,
      left: node.x,
      top: node.y,
      width: node.width,
      height: node.height,
    };
    const value =
      node.key === 'preStartNumber'
        ? form.preStartNumber || numberPreview
        : preStartDocumentValue(form, node.key);
    switch (node.kind) {
      case 'action':
        return disabled ? null : (
          <TouchableOpacity
            key={i}
            accessibilityRole="button"
            accessibilityLabel="Mark every checklist item as Yes"
            activeOpacity={0.78}
            hitSlop={8}
            style={[position, styles.yesToAllButton]}
            onPress={onChecklistYesToAll}
          >
            <Text style={styles.yesToAllButtonText}>YES TO ALL</Text>
          </TouchableOpacity>
        );
      case 'box':
        return (
          <View
            key={i}
            pointerEvents="none"
            style={[
              position,
              styles.box,
              node.key === 'preStartNumberBox' ? styles.numberBox : null,
              node.key === 'swmsWarningPill' ? styles.warningPill : null,
              { backgroundColor: node.fill || 'transparent' },
            ]}
          />
        );
      case 'text':
        return (
          <Text
            key={i}
            style={[
              position,
              styles.text,
              {
                fontSize: node.size,
                color: node.color || '#111111',
                lineHeight: (node.size || 10) * 1.2,
                fontWeight: node.bold ? '700' : '400',
              },
            ]}
          >
            {node.label}
          </Text>
        );
      case 'logo':
        return (
          <Image
            key={i}
            source={company.logo}
            resizeMode="contain"
            style={position}
          />
        );
      case 'field':
        if (node.key === 'date') {
          return (
            <TouchableOpacity
              key={i}
              accessibilityLabel="Date"
              disabled={disabled}
              style={position}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.input, { fontSize: node.size }]}>
                {String(value)}
              </Text>
            </TouchableOpacity>
          );
        }
        return (
          <TextInput
            key={i}
            accessibilityLabel={node.label}
            placeholder={node.key === 'areaForeman' ? 'Enter name' : undefined}
            placeholderTextColor="#6B7280"
            editable={!disabled && node.key !== 'preStartNumber'}
            style={[
              position,
              styles.input,
              { fontSize: node.size },
              node.key === 'areaForeman' ? styles.foremanInput : null,
              node.key === 'preStartNumber' ? styles.numberInput : null,
            ]}
            value={String(value || (node.key === 'preStartNumber' ? '…' : ''))}
            onChangeText={text =>
              onUpdate(node.key!, node.numeric ? text.replace(/\D/g, '') : text)
            }
            multiline={node.multiline}
            scrollEnabled={node.multiline}
            keyboardType={node.numeric ? 'number-pad' : 'default'}
            maxLength={node.key?.startsWith('attendee.') ? 70 : undefined}
          />
        );
      case 'choice':
        return (
          <TouchableOpacity
            key={i}
            accessibilityRole="checkbox"
            accessibilityLabel={`${node.label}: ${node.choice ? 'Yes' : 'No'}`}
            accessibilityState={{ checked: value === node.choice, disabled }}
            disabled={disabled}
            style={[
              position,
              styles.choice,
              value === node.choice ? styles.choiceActive : null,
            ]}
            onPress={() =>
              onUpdate(node.key!, value === node.choice ? null : node.choice!)
            }
          >
            <Text style={styles.choiceLabel}>{node.choice ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        );
      case 'photo':
        return (
          <TouchableOpacity
            key={i}
            accessibilityLabel={`Site photo ${node.index! + 1}`}
            disabled={disabled}
            style={[position, styles.photo]}
            onPress={() => onPhoto(node.index!)}
          >
            {photoUrls[node.index!] ? (
              <Image
                source={{ uri: photoUrls[node.index!] }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="contain"
              />
            ) : (
              <Feather name="camera" size={64} color="#D5D5D5" />
            )}
          </TouchableOpacity>
        );
      case 'signature': {
        const strokes = form.attendees[node.index!]?.signatureStrokes || [];
        return (
          <TouchableOpacity
            key={i}
            accessibilityLabel={`Initial for attendee ${node.index! + 1}`}
            disabled={disabled}
            style={position}
            onPress={() => onSignature(node.index!)}
          >
            {strokes.length ? (
              <Svg width={node.width} height={node.height} viewBox="0 0 200 70">
                {strokes.map((stroke, j) => (
                  <Polyline
                    key={j}
                    points={stroke
                      .map(point => `${point.x * 200},${point.y * 70}`)
                      .join(' ')}
                    stroke="#111111"
                    strokeWidth={2}
                    fill="none"
                  />
                ))}
              </Svg>
            ) : !disabled ? (
              <Text style={styles.signPrompt}>Tap to initial</Text>
            ) : null}
          </TouchableOpacity>
        );
      }
    }
  };
  return (
    <>
      <ScrollView
        testID="ess-pre-start-stable-scroll-pager"
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
        pagingEnabled
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        onLayout={event => {
          const next = event.nativeEvent.layout;
          if (
            Math.abs(next.width - pagerSize.width) > 1 ||
            Math.abs(next.height - pagerSize.height) > 1
          ) {
            setPagerSize({ width: next.width, height: next.height });
          }
        }}
      >
        {pages.map((nodes, page) => {
          const pageHeight = PRE_START_EDITOR_HEIGHTS[page];
          const scale = Math.min(
            (viewportWidth - 32) / PRE_START_EDITOR_WIDTH,
            (visibleHeight - 24) / pageHeight,
          );
          const fitted = {
            width: PRE_START_EDITOR_WIDTH * scale,
            height: pageHeight * scale,
          };
          return (
            <View key={page} style={[styles.slot, { height: availableHeight }]}>
              <ScrollView
                key={`${page}-${viewportWidth}`}
                testID={`ess-pre-start-stable-scroll-page-${page + 1}`}
                style={[
                  styles.viewport,
                  { width: viewportWidth, height: visibleHeight },
                ]}
                contentContainerStyle={fitted}
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
                <View style={[styles.fitCanvas, fitted]}>
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: PRE_START_EDITOR_WIDTH,
                      height: pageHeight,
                      transformOrigin: 'top left',
                      transform: [{ scale }],
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {nodes.map(renderNode)}
                  </View>
                </View>
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
      <ProjectDataDatePicker
        visible={showDatePicker}
        value={form.date}
        onClose={() => setShowDatePicker(false)}
        onChange={date => onUpdate('date', date)}
      />
    </>
  );
}
const styles = StyleSheet.create({
  pager: { flex: 1, backgroundColor: '#FFFFFF' },
  pagerContent: { flexGrow: 1, padding: 0, backgroundColor: '#FFFFFF' },
  slot: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  viewport: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  fitCanvas: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    shadowColor: '#111827',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  box: { borderWidth: 0.6, borderColor: '#C6C6C6' },
  text: { color: '#111111' },
  input: {
    zIndex: 2,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
    color: '#111111',
    fontWeight: '600',
    textAlignVertical: 'top',
    includeFontPadding: false,
  },
  foremanInput: {
    paddingHorizontal: 8,
    textAlignVertical: 'center',
  },
  choice: {
    zIndex: 2,
    borderWidth: 1,
    borderColor: '#111111',
    backgroundColor: '#F7F7F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceLabel: { fontSize: 9, lineHeight: 11, color: '#6B7280' },
  choiceActive: { backgroundColor: 'rgba(75, 85, 99, 0.28)' },
  numberBox: { borderWidth: 1, borderColor: '#F04438' },
  warningPill: { borderRadius: 11, borderColor: '#FCA5A5', borderWidth: 1 },
  yesToAllButton: {
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.75,
    borderColor: '#6B3A00',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
  },
  yesToAllButtonText: {
    color: '#3F270F',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  numberInput: {
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 1,
  },
  photo: { alignItems: 'center', justifyContent: 'center' },
  signPrompt: {
    fontSize: 7,
    color: '#888888',
    textAlign: 'center',
    paddingTop: 4,
  },
});
