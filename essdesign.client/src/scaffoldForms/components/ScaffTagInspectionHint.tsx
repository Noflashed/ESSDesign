import React from 'react';
import {AccessibilityInfo, Animated, Platform, StyleSheet, Text, TouchableOpacity} from '../browser/runtime';

export default function ScaffTagInspectionHint({date, onDismiss}: {date: string; onDismiss: () => void}) {
  const opacity = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduceMotion => {
      if (!active || reduceMotion) { return; }
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, {toValue: 0.6, duration: 650, useNativeDriver: Platform.OS !== 'web'}),
        Animated.timing(opacity, {toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web'}),
      ]), {iterations: 3});
      animation.start();
    }).catch(() => {});
    return () => { active = false; animation?.stop(); };
  }, [opacity]);
  return (
    <Animated.View style={[styles.banner, {opacity}]} accessibilityLiveRegion="polite">
      <Text style={styles.message}>Tap {date} in the DATE column to record your inspection.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss inspection tip" onPress={onDismiss} style={styles.dismiss}>
        <Text style={styles.dismissText}>Got it</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F6EF', borderBottomWidth: 1, borderBottomColor: '#B5DDC6', paddingHorizontal: 16, paddingVertical: 10},
  message: {flex: 1, color: '#125C38', fontSize: 14, fontWeight: '600'},
  dismiss: {paddingHorizontal: 12, paddingVertical: 10, marginLeft: 8},
  dismissText: {color: '#125C38', fontSize: 13, fontWeight: '700'},
});
