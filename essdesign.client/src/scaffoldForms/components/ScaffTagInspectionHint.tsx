import React from 'react';
import {AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View} from '../browser/runtime';

type Measurable = {measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void};
type Rect = {x: number; y: number; width: number; height: number};
type Props = {
  date: string;
  containerRef: React.RefObject<Measurable | null>;
  columnRef: React.RefObject<Measurable | null>;
  columnEndRef: React.RefObject<Measurable | null>;
  targetRef: React.RefObject<Measurable | null>;
  onInspect: () => void;
  onDismiss: () => void;
  onReveal: (offset: number) => void;
};
const measure = (node: Measurable) => new Promise<Rect>(resolve => node.measureInWindow((x, y, width, height) => resolve({x, y, width, height})));

export default function ScaffTagInspectionHint({date, containerRef, columnRef, columnEndRef, targetRef, onInspect, onDismiss, onReveal}: Props) {
  const motion = React.useRef(new Animated.Value(0)).current;
  const [bounds, setBounds] = React.useState<{width: number; height: number; column: Rect; target: Rect} | null>(null);
  const revealRef = React.useRef(onReveal);
  revealRef.current = onReveal;
  React.useEffect(() => {
    let active = true;
    let revealed = false;
    let busy = false;
    const update = async () => {
      if (busy || !containerRef.current || !columnRef.current || !columnEndRef.current || !targetRef.current) { return; }
      busy = true;
      const [container, first, last, target] = await Promise.all([containerRef.current, columnRef.current, columnEndRef.current, targetRef.current].map(measure));
      busy = false;
      if (!active || !container.width || !target.width) { return; }
      const localTarget = {...target, x: target.x - container.x, y: target.y - container.y};
      if (!revealed && (localTarget.y < 100 || localTarget.y + target.height > container.height - 60)) {
        revealed = true;
        revealRef.current(localTarget.y - 160);
        return;
      }
      if (localTarget.y < 0 || localTarget.y + target.height > container.height) { setBounds(null); return; }
      const top = Math.max(0, first.y - container.y - 4);
      const bottom = Math.min(container.height, last.y - container.y + last.height + 4);
      setBounds({width: container.width, height: container.height, target: localTarget, column: {
        x: Math.max(0, first.x - container.x - 4), y: top,
        width: Math.min(first.width + 8, container.width - Math.max(0, first.x - container.x - 4)), height: Math.max(0, bottom - top),
      }});
    };
    void update();
    const timer = setInterval(() => { void update(); }, 250);
    return () => { active = false; clearInterval(timer); };
  }, [containerRef, columnRef, columnEndRef, targetRef]);
  React.useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduceMotion => {
      if (!active || reduceMotion) { return; }
      animation = Animated.loop(Animated.sequence([
        Animated.timing(motion, {toValue: 1, duration: 550, useNativeDriver: Platform.OS !== 'web'}),
        Animated.timing(motion, {toValue: 0, duration: 550, useNativeDriver: Platform.OS !== 'web'}),
      ]));
      animation.start();
    }).catch(() => {});
    return () => { active = false; animation?.stop(); };
  }, [motion]);
  if (!bounds) { return null; }
  const {width, height, column, target} = bounds;
  const right = column.x + column.width;
  const messageWidth = Math.min(240, width - right - 24);
  const beside = messageWidth >= 150;
  const messageTop = beside ? Math.max(80, Math.min(target.y - 50, height - 180)) : Math.max(16, column.y - 150);
  return (
    <View style={styles.overlay} pointerEvents="box-none" accessibilityViewIsModal>
      {[
        {left: 0, top: 0, width, height: column.y},
        {left: 0, top: column.y + column.height, width, height: Math.max(0, height - column.y - column.height)},
        {left: 0, top: column.y, width: column.x, height: column.height},
        {left: right, top: column.y, width: Math.max(0, width - right), height: column.height},
      ].map((rect, index) => <Pressable key={index} style={[styles.shade, rect]} onPress={onDismiss} accessibilityLabel="Dismiss inspection guide" />)}
      <View pointerEvents="none" style={[styles.outline, {left: column.x, top: column.y, width: column.width, height: column.height}]} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Inspect now: tap ${date}`} onPress={onInspect}
        style={[styles.target, {left: target.x, top: target.y, width: target.width, height: target.height}]} />
      <Animated.View pointerEvents="none" style={{position: 'absolute', left: target.x + target.width / 2 - 22, top: target.y + target.height - 3,
        transform: [{translateY: motion.interpolate({inputRange: [0, 1], outputRange: [12, 0]})}, {scale: motion.interpolate({inputRange: [0, 1], outputRange: [1, 0.9]})}]}}>
        <Text style={styles.hand}>👆</Text>
      </Animated.View>
      <View style={[styles.message, {left: beside ? right + 12 : 16, top: messageTop, width: beside ? messageWidth : width - 32}]} accessibilityLiveRegion="polite">
        <Text style={styles.title}>Tap the date to inspect</Text>
        <Text style={styles.description}>Tap {date} in the highlighted column to fill the row with today's inspection details.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onDismiss} style={styles.dismiss}><Text style={styles.dismissText}>Got it</Text></TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: {...StyleSheet.absoluteFillObject, zIndex: 9999},
  shade: {position: 'absolute', backgroundColor: 'rgba(0,0,0,0.78)'},
  outline: {position: 'absolute', borderWidth: 2, borderColor: '#8DE5B5', borderRadius: 6},
  target: {position: 'absolute', borderWidth: 2, borderColor: '#0B7F45', borderRadius: 4},
  hand: {fontSize: 42, lineHeight: 52},
  message: {position: 'absolute', padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF'},
  title: {color: '#125C38', fontSize: 17, fontWeight: '700', marginBottom: 6},
  description: {color: '#253348', fontSize: 14, lineHeight: 20},
  dismiss: {alignSelf: 'flex-start', paddingVertical: 10, paddingRight: 20, marginTop: 4},
  dismissText: {color: '#0B7F45', fontSize: 14, fontWeight: '700'},
});
