// Derived from ESSApp/src/components/SignaturePadModal.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from '../browser/runtime';
import Feather from '../browser/Feather';

import {usePreferences} from '../context/PreferencesContext';
import {BorderRadius, Colors, FontSize, getTheme} from '../theme/appTheme';

export type SignaturePadPoint = {x: number; y: number};
export type SignaturePadStroke = SignaturePadPoint[];

type Props = {
  visible: boolean;
  title: string;
  initialStrokes: SignaturePadStroke[];
  applyLabel?: string;
  canvasHeight?: number;
  onApply: (strokes: SignaturePadStroke[]) => void;
  onClose: () => void;
};

const MIN_POINT_DISTANCE_PX = 1.75;

function cloneStrokes(strokes: SignaturePadStroke[]): SignaturePadStroke[] {
  return strokes.map(stroke => stroke.map(point => ({...point})));
}

export default React.memo(function SignaturePadModal({
  visible,
  title,
  initialStrokes,
  applyLabel = 'Apply',
  canvasHeight = 280,
  onApply,
  onClose,
}: Props) {
  const prefs = usePreferences();
  const theme = getTheme(prefs.themeMode);
  const {width: viewportWidth, height: viewportHeight} = useWindowDimensions();
  const isIPhone = Platform.OS === 'ios' && !Platform.isPad;
  const rotateForPortrait = isIPhone && viewportHeight > viewportWidth;
  const [canvasSize, setCanvasSize] = React.useState({width: 0, height: 0});
  const [renderedStrokes, setRenderedStrokes] = React.useState<SignaturePadStroke[]>([]);
  const strokesRef = React.useRef<SignaturePadStroke[]>([]);
  const canvasSizeRef = React.useRef({width: 0, height: 0});
  const drawingRef = React.useRef(false);
  const renderFrameRef = React.useRef<number | null>(null);

  const publishStrokes = React.useCallback((immediate = false) => {
    const publish = () => {
      renderFrameRef.current = null;
      setRenderedStrokes(cloneStrokes(strokesRef.current));
    };
    if (immediate) {
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      publish();
      return;
    }
    if (renderFrameRef.current === null) {
      renderFrameRef.current = requestAnimationFrame(publish);
    }
  }, []);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const next = cloneStrokes(initialStrokes);
    strokesRef.current = next;
    setRenderedStrokes(next);
  }, [initialStrokes, visible]);

  React.useEffect(() => () => {
    if (renderFrameRef.current !== null) {
      cancelAnimationFrame(renderFrameRef.current);
    }
  }, []);

  const eventPoint = React.useCallback((event: {
    nativeEvent: {locationX: number; locationY: number};
  }): SignaturePadPoint => {
    const {width, height} = canvasSizeRef.current;
    return {
      x: Math.max(0, Math.min(1, event.nativeEvent.locationX / Math.max(width, 1))),
      y: Math.max(0, Math.min(1, event.nativeEvent.locationY / Math.max(height, 1))),
    };
  }, []);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      drawingRef.current = true;
      strokesRef.current = [...strokesRef.current, [eventPoint(event)]];
      publishStrokes(true);
    },
    onPanResponderMove: event => {
      if (!drawingRef.current) {
        return;
      }
      const point = eventPoint(event);
      const strokes = strokesRef.current;
      const stroke = strokes[strokes.length - 1];
      const previous = stroke?.[stroke.length - 1];
      if (!stroke || !previous) {
        return;
      }
      const width = Math.max(canvasSizeRef.current.width, 1);
      const height = Math.max(canvasSizeRef.current.height, 1);
      const dx = (point.x - previous.x) * width;
      const dy = (point.y - previous.y) * height;
      if ((dx * dx) + (dy * dy) < MIN_POINT_DISTANCE_PX * MIN_POINT_DISTANCE_PX) {
        return;
      }
      stroke.push(point);
      publishStrokes();
    },
    onPanResponderRelease: () => {
      drawingRef.current = false;
      publishStrokes(true);
    },
    onPanResponderTerminate: () => {
      drawingRef.current = false;
      publishStrokes(true);
    },
  }), [eventPoint, publishStrokes]);

  const clear = React.useCallback(() => {
    strokesRef.current = [];
    publishStrokes(true);
  }, [publishStrokes]);

  const apply = React.useCallback(() => {
    publishStrokes(true);
    onApply(cloneStrokes(strokesRef.current));
  }, [onApply, publishStrokes]);

  const renderedSegments = React.useMemo(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) {
      return null;
    }
    const strokeWidth = 2.6;
    const capSize = 3.2;
    const nodes: React.ReactNode[] = [];
    renderedStrokes.forEach((stroke, strokeIndex) => {
      for (let index = 1; index < stroke.length; index += 1) {
        const previous = stroke[index - 1];
        const current = stroke[index];
        const x1 = previous.x * canvasSize.width;
        const y1 = previous.y * canvasSize.height;
        const x2 = current.x * canvasSize.width;
        const y2 = current.y * canvasSize.height;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt((dx * dx) + (dy * dy));
        if (!Number.isFinite(length) || length < 0.5) {
          continue;
        }
        const solidLength = length + (strokeWidth * 1.5);
        nodes.push(
          <View
            key={`segment-${strokeIndex}-${index}`}
            style={[
              styles.segment,
              {
                left: ((x1 + x2) / 2) - (solidLength / 2),
                top: ((y1 + y2) / 2) - (strokeWidth / 2),
                width: solidLength,
                height: strokeWidth,
                borderRadius: strokeWidth / 2,
                transform: [{rotateZ: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`}],
              },
            ]}
          />,
        );
      }
      const last = stroke[stroke.length - 1];
      if (last) {
        nodes.push(
          <View
            key={`cap-${strokeIndex}`}
            style={[
              styles.segment,
              {
                left: Math.max(0, Math.min(canvasSize.width - capSize, (last.x * canvasSize.width) - (capSize / 2))),
                top: Math.max(0, Math.min(canvasSize.height - capSize, (last.y * canvasSize.height) - (capSize / 2))),
                width: capSize,
                height: capSize,
                borderRadius: capSize / 2,
              },
            ]}
          />,
        );
      }
    });
    return nodes;
  }, [canvasSize.height, canvasSize.width, renderedStrokes]);

  const iPhoneCardSize = rotateForPortrait
    ? {width: viewportHeight, height: viewportWidth, transform: [{rotate: '90deg'}]}
    : {width: viewportWidth, height: viewportHeight};

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, isIPhone ? styles.iPhoneBackdrop : null]}
        onPress={isIPhone ? undefined : onClose}>
        <Pressable
          accessibilityViewIsModal
          style={[
            styles.card,
            {backgroundColor: theme.card},
            isIPhone ? styles.iPhoneCard : null,
            isIPhone ? iPhoneCardSize : null,
          ]}
          onPress={() => {}}>
          <View style={[styles.header, isIPhone ? styles.iPhoneHeader : null]}>
            {!isIPhone ? (
              <Text style={[styles.title, {color: theme.text}]} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {isIPhone ? (
              <View style={styles.iPhoneHeaderActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.72}
                  style={[
                    styles.secondaryButton,
                    styles.iPhoneSecondaryButton,
                    {borderColor: theme.border, backgroundColor: theme.surface},
                  ]}
                  onPress={clear}>
                  <Feather name="trash-2" size={15} color={theme.text} />
                  <Text style={[styles.secondaryButtonText, {color: theme.text}]}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.76}
                  style={[styles.primaryButton, styles.iPhonePrimaryButton]}
                  onPress={apply}>
                  <Feather name="check" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>{applyLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close signature"
                activeOpacity={0.7}
                style={[styles.closeButton, {borderColor: theme.border, backgroundColor: theme.surface}]}
                onPress={onClose}>
                <Feather name="x" size={18} color={theme.text} />
              </TouchableOpacity>
            )}
          </View>
          <View
            style={[
              styles.canvas,
              {borderColor: theme.border},
              isIPhone ? styles.iPhoneCanvas : {height: canvasHeight},
            ]}
            onLayout={event => {
              const {width, height} = event.nativeEvent.layout;
              const next = {width, height};
              canvasSizeRef.current = next;
              setCanvasSize(next);
            }}
            {...panResponder.panHandlers}>
            {renderedSegments}
            {renderedStrokes.length === 0 ? <Text style={styles.placeholder}>Sign here</Text> : null}
          </View>
          {!isIPhone ? (
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.72}
                style={[styles.secondaryButton, {borderColor: theme.border}]}
                onPress={clear}>
                <Text style={[styles.secondaryButtonText, {color: theme.text}]}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.76}
                style={styles.primaryButton}
                onPress={apply}>
                <Text style={styles.primaryButtonText}>{applyLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iPhoneBackdrop: {padding: 0},
  card: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    padding: 14,
    gap: 12,
    borderRadius: BorderRadius.md,
  },
  iPhoneCard: {maxWidth: undefined, maxHeight: undefined, borderRadius: 0},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  iPhoneHeader: {minHeight: 44, justifyContent: 'flex-end'},
  title: {flex: 1, fontSize: FontSize.lg, fontWeight: '800'},
  iPhoneHeaderActions: {flexDirection: 'row', alignItems: 'center', gap: 8},
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iPhoneCanvas: {flex: 1, minHeight: 180},
  placeholder: {color: '#9CA3AF', fontSize: FontSize.md, fontWeight: '600'},
  segment: {position: 'absolute', backgroundColor: '#000000'},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10},
  secondaryButton: {
    minWidth: 104,
    height: 42,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  iPhoneSecondaryButton: {
    minWidth: 88,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 13,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryButtonText: {fontSize: FontSize.sm, fontWeight: '800'},
  primaryButton: {
    minWidth: 104,
    height: 42,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  iPhonePrimaryButton: {
    minWidth: 132,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 7,
  },
  primaryButtonText: {color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '800'},
});
