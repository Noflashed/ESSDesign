import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const ESS_NAVY = '#102B5C';
const ESS_ORANGE = '#F47C20';

function FeatherSvg({ type, color }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (type === 'dashboard') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }

  if (type === 'drivers') {
    return (
      <svg {...common}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (type === 'dynamic') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }

  if (type === 'tracking') {
    return (
      <svg {...common}>
        <path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (type === 'schedule') {
    return (
      <svg {...common}>
        <path d="M9 5H7a2 2 0 0 0-2 2v12l4-2 4 2 4-2 4 2V7a2 2 0 0 0-2-2h-2" />
        <rect x="8" y="3" width="8" height="4" rx="1" />
      </svg>
    );
  }

  if (type === 'materials') {
    return (
      <svg {...common}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function NativeIcon({ type, active }) {
  const color = active ? '#FFFFFF' : '#B7C4DD';
  const dot = type === 'dynamic';

  return (
    <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
      <FeatherSvg type={type} color={color} />
      {dot ? (
        <View style={styles.liveDot}>
          <View style={styles.liveDotCore} />
        </View>
      ) : null}
    </View>
  );
}

export default function NativeTransportShell({
  navItems,
  currentPage,
  content,
  isTruckRole,
  assignedTruck,
  onNavigate,
  onExit,
}) {
  return (
    <View style={styles.shell}>
      <View style={styles.sideRail}>
        <View>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>ESS</Text>
            </View>
            <Text style={styles.brandText}>Transport</Text>
          </View>

          <View style={styles.navList}>
            {navItems.map(item => {
              const active = currentPage === item.key || (item.key === 'material-ordering-new' && currentPage === 'material-ordering');
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  onPress={() => onNavigate(item.key)}
                  style={({ pressed }) => [
                    styles.navItem,
                    active && styles.navItemActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <NativeIcon type={item.icon} active={active} />
                  <Text numberOfLines={2} style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onExit || (() => window.history.back())}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backChevron}>{'<'}</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.workspace} dataSet={{ transportRole: isTruckRole ? assignedTruck?.rego || 'truck' : 'management' }}>
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100vh',
    backgroundColor: ESS_NAVY,
  },
  sideRail: {
    width: 118,
    backgroundColor: ESS_NAVY,
    paddingHorizontal: 10,
    paddingTop: 22,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 22,
    gap: 8,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: ESS_NAVY,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  navList: {
    gap: 8,
  },
  navItem: {
    minHeight: 66,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  navItemActive: {
    backgroundColor: '#234988',
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    transform: [{ scale: 1.02 }],
  },
  liveDot: {
    position: 'absolute',
    top: 2,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ESS_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotCore: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  navLabel: {
    color: '#B7C4DD',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#FFFFFF',
  },
  backButton: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  backChevron: {
    color: '#B7C4DD',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
  },
  backText: {
    color: '#B7C4DD',
    fontSize: 10,
    fontWeight: '700',
  },
  workspace: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F6F8FC',
    borderTopLeftRadius: 28,
    overflow: 'hidden',
  },
});
