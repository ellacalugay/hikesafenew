import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Undo2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MORSE_LEGEND = [
  ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'], ['F', '..-.'], ['G', '--.'], ['H', '....'],
  ['I', '..'], ['J', '.---'], ['K', '-.-'], ['L', '.-..'], ['M', '--'], ['N', '-.'], ['O', '---'], ['P', '.--.'],
  ['Q', '--.-'], ['R', '.-.'], ['S', '...'], ['T', '-'], ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'],
  ['Y', '-.--'], ['Z', '--..'],
  ['1', '.----'], ['2', '..---'], ['3', '...--'], ['4', '....-'], ['5', '.....'],
  ['6', '-....'], ['7', '--...'], ['8', '---..'], ['9', '----.'], ['0', '-----'],
];

const MORSE_LETTERS = MORSE_LEGEND.slice(0, 26);
const MORSE_NUMBERS = MORSE_LEGEND.slice(26);

const MorseLegendScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 390;

  const renderSection = (title, subtitle, items) => (
    <View style={[localStyles.sectionCard, { backgroundColor: 'rgba(107, 182, 23, 0.92)', borderColor: colors.primary }]}>
      <Text style={localStyles.sectionTitle}>{title}</Text>
      <Text style={localStyles.sectionSubtitle}>{subtitle}</Text>
      <View style={localStyles.grid}>
        {items.map(([symbol, code]) => (
          <View key={symbol} style={[localStyles.item, { width: compact ? '48%' : '31.5%' }]}>
            <Text style={localStyles.symbol}>{symbol}</Text>
            <Text style={localStyles.code}>{code}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#4D8F0A', '#5EA30F', '#6FB617']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={localStyles.banner}
        >
          <TouchableOpacity onPress={onBack} style={localStyles.bannerBackBtn} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Undo2 size={20} color="#ECFDF3" strokeWidth={2.5} />
          </TouchableOpacity>

          <Text style={localStyles.bannerTitle}>MORSE CODE</Text>
          <View style={localStyles.bannerKeyRow}>
            <View style={localStyles.keyChip}>
              <Text style={localStyles.keyChipLabel}>.</Text>
              <Text style={localStyles.keyChipText}>dot</Text>
            </View>
            <View style={localStyles.keyChip}>
              <Text style={localStyles.keyChipLabel}>-</Text>
              <Text style={localStyles.keyChipText}>dash</Text>
            </View>
          </View>
        </LinearGradient>

        {renderSection('Letters', 'A to Z', MORSE_LETTERS)}
        {renderSection('Numbers', '0 to 9', MORSE_NUMBERS)}
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  banner: {
    borderColor: '#4A870A',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    position: 'relative',
  },
  bannerBackBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(234,255,219,0.42)',
    zIndex: 2,
  },
  bannerTitle: {
    color: '#F3FFE8',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  bannerKeyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  keyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(235,255,220,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(233,255,217,0.44)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  keyChipLabel: {
    color: '#F3FFE8',
    fontSize: 16,
    fontWeight: '800',
    marginRight: 6,
    minWidth: 10,
    textAlign: 'center',
  },
  keyChipText: {
    color: '#E8FFD8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  sectionTitle: {
    color: '#F3FFE8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sectionSubtitle: {
    color: '#E8FFD8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 8,
  },
  item: {
    minWidth: 102,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(233,255,217,0.34)',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  symbol: {
    width: 20,
    color: '#F3FFE8',
    fontWeight: '800',
    fontSize: 17,
  },
  code: {
    color: '#E8FFD8',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'monospace',
    marginLeft: 6,
  },
});

export default MorseLegendScreen;
