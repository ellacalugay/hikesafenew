import { StyleSheet, Dimensions, Platform } from 'react-native';
import { COLORS } from '../constants';

const { width, height } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: height,
  },
  // Abstract background shapes
  bgTreeLeft: {
    position: 'absolute',
    bottom: 0,
    left: -50,
    width: 200,
    height: 400,
    backgroundColor: '#1a2e05',
    opacity: 0.1,
    transform: [{ rotate: '10deg' }],
    borderTopRightRadius: 100,
  },
  bgTreeRight: {
    position: 'absolute',
    bottom: 0,
    right: -50,
    width: 200,
    height: 350,
    backgroundColor: '#365314',
    opacity: 0.1,
    transform: [{ rotate: '-15deg' }],
    borderTopLeftRadius: 100,
  },
  bgMountain: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: width,
    height: 150,
    backgroundColor: '#ecfccb',
    opacity: 0.8,
  },

  // Layouts
  contentContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },

  // Typography
  titleLarge: {
    fontSize: 45,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 30,
    marginTop: -10,
    textAlign: 'center',
    top: 30,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#2f4f09', // Darker Moss
    marginTop: 10,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  logoImage: {
    width: 200,
    height:200,
    resizeMode: 'cover',
    alignSelf: 'center',
    marginBottom: 6,
    overflow: 'visible',
  },
  tagline: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginTop: 5,
    fontStyle: 'italic',
    alignItems: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginTop: 20,
    marginBottom: 10,
  },

  // Input
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.textDark,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  inputBox: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  inputWhite: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
    width: '100%',
  },

  hrLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    width: '80%',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  separatorThin: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: '100%',
    marginVertical: 12,
    borderRadius: 2,
  },
  cardTitleLarge: {
    fontSize: 28,
    fontWeight: '900',
    color: 'rgba(0,0,0,0.30)',
    alignSelf: 'flex-start',
    width: '100%',
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  formGrid: {
    width: '100%',
    marginTop: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: 'white',
    width: '30%',
    fontWeight: '700',
    fontSize: 14,
  },
  inputWhiteRounded: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '65%',
  },
  createNowButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'center',
    width: '60%',
    marginTop: 12,
  },
  createNowText: {
    color: COLORS.primary,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Buttons
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: COLORS.primaryLight,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonTextPrimary: {
    color: 'white',
  },
  buttonWhite: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 15,
    marginBottom: 10,
  },
  buttonTextGreen: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipText: {
    color: COLORS.black,
    fontWeight: '600',
  },
  linkTextWhite: {
    color: 'white',
    fontSize: 12,
    marginTop: 10,
  },

  // Modules/Cards
  cardGreen: {
    backgroundColor: '#65a30d', // Match Figma green
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  cardTitleWhite: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  cardSubtitleWhite: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    alignItems: 'left',
  },
  cardDescWhite: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 15,
  },
  separatorWhite: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: '100%',
    marginVertical: 10,
  },

  // Dashboard Specific
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 14,
    color: COLORS.textDark,
  },
  usernameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  lobbyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  lobbyLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  lobbyCode: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  signalIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    marginTop: 4,
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: 'white',
    borderRadius: 1,
  },
  
  // Services Grid
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  serviceItem: {
    alignItems: 'center',
  },
  serviceIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#d9f99d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  serviceText: {
    fontSize: 12,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  
  // Recent Activity
  activityCard: {
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },

  // Tab Nav
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 10,
    paddingBottom: 20,
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    position: 'absolute',
    bottom: 0,
    width: width,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
    justifyContent: 'center',
    padding: 24,
  },
  modalContentGreen: {
    backgroundColor: '#4d7c0f',
    borderRadius: 16,
    padding: 26,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitleWhite: {
    fontSize: 25,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  modalTextWhite: {
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
  },
  modalNumber: {
    width: 24,
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSectionTitle: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  modalParagraph: {
    color: 'white',
    lineHeight: 20,
    marginLeft: 23,
    marginBottom: 8,
    fontSize: 13,
    textAlign: 'justify',
  },
  lobbyCreateBg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },

  // Utils
  headerSpacer: { height: 60 },
  logoSection: { alignItems: 'center', marginBottom: 40, marginTop: 60 },
  illustrationSpace: { alignItems: 'center', marginVertical: 30 },
  footer: { marginTop: 'auto' },
  // Used to vertically center the form on onboarding screens
  centeredForm: {
    flex: 1,
    justifyContent: 'center',
  },
  // Center a whole screen's content
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Specific layout for onboarding details form
  detailForm: {
    width: '100%',
    maxWidth: 520,
    top: 60,
    marginVertical: 20,
  },
  detailTitle: {
    textAlign: 'center',
    marginBottom: 5,
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#111',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: 'white',
  },
  checkboxTick: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 14,
  },
  errorText: {
    color: 'red',
    marginTop: 6,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelSmall: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  
  // Location Tab
  headerBar: {
    backgroundColor: '#d9f99d',
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 15,
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORS.textDark,
    textTransform: 'uppercase',
  },
  userLocationRow: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  avatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  locationText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600'
  },
  
  // Message Tab
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  chatName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  // --- UPDATED COMPASS STYLES ---
  tabContainer: {
    flex: 1,
  },
  compassContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  // The Black Rounded Square Box from the image
  blackCompassBox: {
    width: 280,
    height: 280,
    backgroundColor: 'black',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  // The fixed red/white arrow at the top center of the black box
  topArrow: {
    position: 'absolute',
    top: 15,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    zIndex: 10,
  },
  // The rotating part
  compassInnerDial: {
    width: 240,
    height: 240,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    // borderWidth: 2,
    // borderColor: '#333',
  },
  // The ticks around the circle
  tickRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'white',
    borderStyle: 'dashed', // Simulates ticks
    opacity: 0.5,
  },
  directionTextBold: {
    position: 'absolute',
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white'
  },
  crosshairVerticalLight: {
    position: 'absolute',
    width: 2,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },
  crosshairHorizontalLight: {
    position: 'absolute',
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },

  // Status and Toggle
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 10
  },
  locationServicesLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },

  // Coordinates and Location Text
  coordsBoxTransparent: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  coordsTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textDark,
    marginBottom: 5
  },
  coordsSubtitle: {
    textAlign: 'center',
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600',
    opacity: 0.8
  },

  // Distance Bar (Green bar at bottom of compass tab)
  distanceBar: {
    backgroundColor: COLORS.primaryLight,
    padding: 15,
    marginHorizontal: 0,
    marginTop: 'auto',
    marginBottom: 60, // Space for nav bar
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30
  },
  distanceLabel: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
    textTransform: 'uppercase'
  },
  distanceValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18
  },

  // Profile Tab
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 40
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 5
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.textDark
  },
  menuList: {
    paddingHorizontal: 20
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 1
  },
  menuLabel: {
    marginLeft: 15,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textDark
  },
  
  // Lobby Modal Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    paddingBottom: 5
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14
  },
  infoValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14
  },
  
  // Form section
  formSection: {},
});
