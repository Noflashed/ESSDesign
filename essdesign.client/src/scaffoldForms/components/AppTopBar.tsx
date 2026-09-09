// Derived from ESSApp/src/components/AppTopBar.tsx; regenerate with scripts/sync-ios-scaffold-forms.py.
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Image, ViewStyle} from '../browser/runtime';
import Feather from '../browser/Feather';
import {getTheme, Spacing, FontSize} from '../theme/appTheme';

interface Props {
  theme: ReturnType<typeof getTheme>;
  isDarkMode: boolean;
  title?: string;
  centerContent?: React.ReactNode;
  showMenu?: boolean;
  showLeftLogo?: boolean;
  onPressMenu: () => void;
  onPressBack?: () => void;
  rightContent?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export default function AppTopBar({
  theme,
  isDarkMode,
  title,
  centerContent,
  showMenu = true,
  showLeftLogo = true,
  onPressMenu,
  onPressBack,
  rightContent,
  containerStyle,
}: Props) {
  const styles = makeStyles(theme);
  const useCompactSides = !showMenu && !showLeftLogo;

  return (
    <View style={[styles.bar, containerStyle]}>
      <View style={[styles.left, useCompactSides ? styles.compactSide : null]}>
        {showMenu ? (
          <TouchableOpacity onPress={onPressMenu} style={styles.tapTarget} accessibilityLabel="Open navigation menu">
            <Feather name="menu" size={24} color={theme.text} />
          </TouchableOpacity>
        ) : null}
        {onPressBack ? (
          <TouchableOpacity onPress={onPressBack} style={styles.tapTarget} accessibilityLabel="Go back">
            <Feather name="arrow-left" size={23} color={theme.text} />
          </TouchableOpacity>
        ) : null}
        {showLeftLogo ? (
          <View style={styles.logoWrap}>
            <Image
              source={{uri: '/scaffold-forms/logo.png'}}
              style={[styles.logo, isDarkMode ? styles.logoDark : null]}
              resizeMode="contain"
            />
          </View>
        ) : null}
      </View>

      {centerContent ? (
        <View style={styles.center}>{centerContent}</View>
      ) : title ? (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : (
        <View style={styles.center} />
      )}

      <View style={[styles.right, useCompactSides ? styles.compactSide : null]}>{rightContent}</View>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    bar: {
      height: 56,
      paddingHorizontal: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 120,
    },
    tapTarget: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 2,
    },
    logoWrap: {
      width: 46,
      height: 44,
      marginLeft: 3,
      overflow: 'hidden',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: 44,
      height: 24,
    },
    logoDark: {
      tintColor: '#FFFFFF',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: theme.text,
      fontSize: FontSize.lg,
      fontWeight: '700',
      paddingHorizontal: Spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    right: {
      minWidth: 120,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    compactSide: {
      minWidth: 44,
    },
  });
}
