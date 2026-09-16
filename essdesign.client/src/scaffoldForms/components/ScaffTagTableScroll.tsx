import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';

type Props = {children: React.ReactNode; maxHeight: number; enabled: boolean};

export default function ScaffTagTableScroll({children, maxHeight, enabled}: Props) {
  const [viewport, setViewport] = React.useState(0);
  const [content, setContent] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const trackHeight = Math.max(0, viewport - 12);
  const thumbHeight = Math.min(trackHeight, Math.max(30, trackHeight * viewport / Math.max(content, 1)));
  const thumbTop = Math.min(1, Math.max(0, offset / Math.max(1, content - viewport))) * (trackHeight - thumbHeight);
  return (
    <View>
      <View>
        <ScrollView
          style={{maxHeight}}
          nestedScrollEnabled
          scrollEnabled={enabled}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={enabled ? styles.scrollContent : undefined}
          onLayout={event => setViewport(event.nativeEvent.layout.height)}
          onContentSizeChange={(_width, height) => setContent(height)}
          onScroll={event => setOffset(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}>
          {children}
        </ScrollView>
        {enabled && <View pointerEvents="none" style={styles.track}>
          <View style={[styles.thumb, {height: thumbHeight, top: thumbTop}]} />
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {paddingRight: 14},
  track: {position: 'absolute', right: 2, top: 6, bottom: 6, width: 10, borderRadius: 5, backgroundColor: '#D3E1DA'},
  thumb: {position: 'absolute', left: 1, width: 8, borderRadius: 4, backgroundColor: '#0B7F45'},
});
