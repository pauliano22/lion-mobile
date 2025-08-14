// App.tsx - Lion Mobile AI Detection (Ultra-Clean Minimal Design)
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Platform,
  Animated,
  Switch,
  StatusBar,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import {
  Mic,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle,
  FileText,
  BarChart3,
  Play,
  Square,
} from 'lucide-react-native';

interface DetectionResult {
  isAI: boolean;
  aiPercent: number;
  timestamp: Date;
  type: 'voice' | 'text';
}

interface DetectionStats {
  total: number;
  ai: number;
  real: number;
  alerts: number;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function LoadingScreen({ onLoadComplete }: { onLoadComplete: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shieldRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.timing(shieldRotate, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    ).start();

    setTimeout(onLoadComplete, 2500);
  }, []);

  const rotation = shieldRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
        <Animated.View style={{ transform: [{ rotate: rotation }], marginBottom: 48 }}>
          <Shield size={56} color="#ff4444" strokeWidth={1} />
        </Animated.View>
        
        <Text style={styles.loadingTitle}>LION</Text>
        <View style={styles.loadingLine} />
        <Text style={styles.loadingSubtitle}>AI Detection System</Text>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceDetectionEnabled, setVoiceDetectionEnabled] = useState(true);
  const [textDetectionEnabled, setTextDetectionEnabled] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [stats, setStats] = useState<DetectionStats>({ total: 0, ai: 0, real: 0, alerts: 0 });
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLoading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const startDetection = async () => {
    try {
      if (!voiceDetectionEnabled && !textDetectionEnabled) {
        Alert.alert('Enable Detection', 'Please enable at least one detection method.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      startDetectionSimulation();
      
    } catch (error) {
      Alert.alert('Permission Required', 'Please grant microphone access.');
    }
  };

  const stopDetection = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        setRecording(null);
      }
      setIsRecording(false);
    } catch (error) {
      console.error('Stop detection error:', error);
    }
  };

  const startDetectionSimulation = () => {
    const interval = setInterval(async () => {
      if (!isRecording) {
        clearInterval(interval);
        return;
      }

      const types = [];
      if (voiceDetectionEnabled) types.push('voice');
      if (textDetectionEnabled) types.push('text');
      
      if (types.length === 0) return;

      const randomType = types[Math.floor(Math.random() * types.length)] as 'voice' | 'text';
      const isAIDetected = Math.random() > 0.83;

      const result: DetectionResult = {
        isAI: isAIDetected,
        aiPercent: isAIDetected ? 78 + Math.random() * 22 : Math.random() * 32,
        timestamp: new Date(),
        type: randomType,
      };

      setLastResult(result);
      setStats(prev => ({
        total: prev.total + 1,
        ai: prev.ai + (result.isAI ? 1 : 0),
        real: prev.real + (result.isAI ? 0 : 1),
        alerts: prev.alerts + (result.isAI ? 1 : 0)
      }));

      if (result.isAI) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'AI Detected',
            body: `${result.aiPercent.toFixed(1)}% confidence`,
          },
          trigger: null,
        });
      }
    }, 8000);
  };

  if (isLoading) {
    return <LoadingScreen onLoadComplete={() => setIsLoading(false)} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brand}>
            <Shield size={18} color="#ff4444" strokeWidth={1} />
            <Text style={styles.brandText}>LION</Text>
          </View>
          
          <View style={styles.status}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Ready</Text>
          </View>
        </View>

        {/* Detection Toggles */}
        <View style={styles.toggleSection}>
          <View style={styles.toggle}>
            <View style={styles.toggleLeft}>
              <Mic size={14} color="#999" strokeWidth={1} />
              <Text style={styles.toggleLabel}>Voice</Text>
            </View>
            <Switch
              value={voiceDetectionEnabled}
              onValueChange={setVoiceDetectionEnabled}
              trackColor={{ false: '#2a2a2a', true: '#ff4444' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.toggle}>
            <View style={styles.toggleLeft}>
              <FileText size={14} color="#999" strokeWidth={1} />
              <Text style={styles.toggleLabel}>Text</Text>
            </View>
            <Switch
              value={textDetectionEnabled}
              onValueChange={setTextDetectionEnabled}
              trackColor={{ false: '#2a2a2a', true: '#ff4444' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Main Action */}
        <View style={styles.actionArea}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.actionButton, isRecording && styles.actionButtonActive]}
              onPress={isRecording ? stopDetection : startDetection}
            >
              {isRecording ? (
                <Square size={20} color="#fff" strokeWidth={1} />
              ) : (
                <Play size={20} color="#fff" strokeWidth={1} />
              )}
            </TouchableOpacity>
          </Animated.View>
          
          <Text style={styles.actionText}>
            {isRecording ? 'Stop Detection' : 'Start Detection'}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#ff4444' }]}>{stats.ai}</Text>
            <Text style={styles.statLabel}>AI</Text>
          </View>
          
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#22c55e' }]}>{stats.real}</Text>
            <Text style={styles.statLabel}>Real</Text>
          </View>
          
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#f59e0b' }]}>{stats.alerts}</Text>
            <Text style={styles.statLabel}>Alerts</Text>
          </View>
        </View>

        {/* Latest Result */}
        {lastResult && (
          <View style={styles.resultSection}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Latest Detection</Text>
              <Text style={styles.resultTime}>
                {lastResult.timestamp.toLocaleTimeString()}
              </Text>
            </View>
            
            <View style={styles.resultContent}>
              <View style={styles.resultStatus}>
                {lastResult.isAI ? (
                  <AlertTriangle size={16} color="#ff4444" strokeWidth={1} />
                ) : (
                  <CheckCircle size={16} color="#22c55e" strokeWidth={1} />
                )}
                <Text style={[
                  styles.resultText,
                  { color: lastResult.isAI ? '#ff4444' : '#22c55e' }
                ]}>
                  {lastResult.isAI ? 'AI Generated' : 'Human Generated'}
                </Text>
              </View>
              
              <Text style={styles.resultConfidence}>
                {lastResult.aiPercent.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: '100',
    color: '#ff4444',
    letterSpacing: 8,
    marginBottom: 16,
  },
  loadingLine: {
    width: 120,
    height: 1,
    backgroundColor: '#333',
    marginBottom: 16,
  },
  loadingSubtitle: {
    fontSize: 11,
    color: '#666',
    letterSpacing: 2,
    fontWeight: '300',
  },

  // Main
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 32,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 48,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 20,
    fontWeight: '100',
    color: '#ff4444',
    letterSpacing: 4,
    marginLeft: 8,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  statusText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '300',
  },

  // Toggles
  toggleSection: {
    marginBottom: 56,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#999',
    fontWeight: '300',
    marginLeft: 12,
  },

  // Action
  actionArea: {
    alignItems: 'center',
    marginBottom: 56,
  },
  actionButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#ff4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButtonActive: {
    backgroundColor: '#333',
    shadowColor: '#333',
  },
  actionText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '300',
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 48,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '100',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '300',
  },

  // Result
  resultSection: {
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingTop: 24,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '300',
  },
  resultTime: {
    fontSize: 10,
    color: '#666',
    fontWeight: '300',
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultText: {
    fontSize: 13,
    fontWeight: '300',
    marginLeft: 8,
  },
  resultConfidence: {
    fontSize: 16,
    color: '#ff4444',
    fontWeight: '100',
  },
});