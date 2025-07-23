import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { 
  Mic, 
  MicOff, 
  AlertCircle, 
  CheckCircle, 
  Activity,
  Zap,
  Shield,
  AlertTriangle,
  Radio,
  Settings,
  ChevronRight
} from 'lucide-react-native';

// Add type declaration for global
declare global {
  var nativeModulesProxy: any;
}

const { width } = Dimensions.get('window');

// Check if we're in development mode without screen recorder
const isDevelopment = __DEV__ && !global.nativeModulesProxy?.ScreenRecorder;

// Import screen recorder (will be undefined in Expo Go)
let ScreenRecorder: any;
if (!isDevelopment) {
  ScreenRecorder = require('react-native-screen-recorder').default;
}

const HF_API_URL = 'https://pauliano22-deepfake-audio-detector.hf.space/gradio_api';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface DetectionResult {
  isAI: boolean;
  aiPercent: number;
  realPercent: number;
  timestamp: Date;
  chunkId: number;
}

interface StreamingConfig {
  RATE: number;
  CHANNELS: number;
  CHUNK_DURATION: number;
  STREAM_INTERVAL: number;
  BUFFER_DURATION: number;
  MIN_VOLUME_THRESHOLD: number;
}

// Loading Screen Component
function LoadingScreen({ onLoadComplete }: { onLoadComplete: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const letterAnims = useRef([
    new Animated.Value(-50),
    new Animated.Value(-50),
    new Animated.Value(-50),
    new Animated.Value(-50),
  ]).current;

  useEffect(() => {
    // Entrance animation sequence
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Rotate the shield icon
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Animate letters dropping in
    const letterAnimations = letterAnims.map((anim, index) =>
      Animated.spring(anim, {
        toValue: 0,
        delay: index * 100,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      })
    );

    Animated.sequence([
      Animated.delay(300),
      Animated.parallel(letterAnimations),
    ]).start(() => {
      // Complete loading after animations
      setTimeout(onLoadComplete, 1000);
    });
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.loadingContainer}>
      <Animated.View
        style={[
          styles.loadingContent,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Animated.View
          style={{
            transform: [{ rotate: spin }],
            marginBottom: 40,
          }}
        >
          <Shield size={80} color="#FFD700" strokeWidth={1.5} />
        </Animated.View>

        <View style={styles.titleContainer}>
          {['L', 'I', 'O', 'N'].map((letter, index) => (
            <Animated.Text
              key={index}
              style={[
                styles.loadingLetter,
                {
                  transform: [
                    { translateY: letterAnims[index] },
                    {
                      rotate: index === 2 ? '360deg' : '0deg', // Spin the 'O'
                    },
                  ],
                },
              ]}
            >
              {letter}
            </Animated.Text>
          ))}
        </View>

        <Animated.View
          style={[
            styles.loadingSubtitle,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <Text style={styles.loadingSubtitleText}>AI Audio Detection</Text>
          <Activity
            size={16}
            color="#999"
            style={{ marginLeft: 8 }}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  
  // Title animation refs
  const titleScaleAnim = useRef(new Animated.Value(1)).current;
  const titleRotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Streaming configuration
  const streamingConfig: StreamingConfig = {
    RATE: 22050,
    CHANNELS: 1,
    CHUNK_DURATION: 4.0,
    STREAM_INTERVAL: 500,
    BUFFER_DURATION: 8.0,
    MIN_VOLUME_THRESHOLD: 0.0001,
  };

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [history, setHistory] = useState<DetectionResult[]>([]);
  const [streamingStatus, setStreamingStatus] = useState('');
  const [detectionEvent, setDetectionEvent] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);

  // Refs for streaming
  const recordingRef = useRef<Audio.Recording | null>(null);
  const audioBufferRef = useRef<number[]>([]);
  const streamingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef(false);
  const lastProcessTimeRef = useRef(0);
  const consecutiveDetectionsRef = useRef(0);

  useEffect(() => {
    if (!isLoading) {
      // Start pulse animation when app loads
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    // Request permissions
    (async () => {
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        Alert.alert('Permission needed', 'Please grant notification permission');
      }

      if (isDevelopment) {
        const { status: audioStatus } = await Audio.requestPermissionsAsync();
        if (audioStatus !== 'granted') {
          Alert.alert('Dev Mode', 'Microphone permission needed for development mode');
        }
      }
    })();

    return () => {
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
      }
    };
  }, [isLoading]);

  // Button press animation
  const animateButtonPress = () => {
    // Animate title
    Animated.parallel([
      Animated.sequence([
        Animated.timing(titleScaleAnim, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(titleScaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(titleRotateAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.elastic(1),
        useNativeDriver: true,
      }),
    ]).start(() => {
      titleRotateAnim.setValue(0);
    });
  };

  // Calculate RMS volume
  function calculateRMS(audioData: number[]): number {
    if (audioData.length === 0) return 0;
    const sum = audioData.reduce((acc, val) => acc + val * val, 0);
    return Math.sqrt(sum / audioData.length);
  }

  // Process audio buffer and send to API
  async function processStreamingChunk() {
    if (!isStreamingRef.current || audioBufferRef.current.length === 0) {
      return;
    }

    const now = Date.now();
    if (now - lastProcessTimeRef.current < streamingConfig.STREAM_INTERVAL) {
      return;
    }

    lastProcessTimeRef.current = now;

    const bufferCopy = [...audioBufferRef.current];
    const bufferDuration = bufferCopy.length / streamingConfig.RATE;

    if (bufferDuration < streamingConfig.CHUNK_DURATION) {
      setStreamingStatus(`Buffering... (${bufferDuration.toFixed(1)}s / ${streamingConfig.CHUNK_DURATION}s needed)`);
      return;
    }

    const volume = calculateRMS(bufferCopy);
    if (volume < streamingConfig.MIN_VOLUME_THRESHOLD) {
      setStreamingStatus(`Audio too quiet (${volume.toFixed(6)})`);
      return;
    }

    const samplesNeeded = Math.floor(streamingConfig.CHUNK_DURATION * streamingConfig.RATE);
    const chunkData = bufferCopy.slice(-samplesNeeded);

    const currentChunkId = chunkCount + 1;
    setChunkCount(currentChunkId);
    setStreamingStatus(`Processing chunk #${currentChunkId} (${streamingConfig.CHUNK_DURATION}s, vol: ${volume.toFixed(4)})`);

    try {
      const wavBlob = await createWavBlob(chunkData, streamingConfig.RATE);
      await processAudioChunk(wavBlob, currentChunkId);
    } catch (error) {
      console.error('Chunk processing error:', error);
      setStreamingStatus(`Error processing chunk #${currentChunkId}`);
    }
  }

  // Create WAV blob from audio data
  async function createWavBlob(audioData: number[], sampleRate: number): Promise<Blob> {
    const length = audioData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  // Process a single audio chunk
  async function processAudioChunk(audioBlob: Blob, chunkId: number) {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      const tempUri = `${FileSystem.cacheDirectory}chunk_${chunkId}.wav`;
      await FileSystem.writeAsStringAsync(tempUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const formData = new FormData();
      formData.append('files', {
        uri: tempUri,
        type: 'audio/wav',
        name: `chunk_${chunkId}.wav`,
      } as any);

      const uploadResponse = await fetch(`${HF_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadResult = await uploadResponse.json();
      const filePath = uploadResult[0];

      const predictionResponse = await fetch(`${HF_API_URL}/call/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [{
            path: filePath,
            meta: { _type: "gradio.FileData" }
          }]
        }),
      });

      const predictionResult = await predictionResponse.json();
      const eventId = predictionResult.event_id;

      let result = null;
      for (let i = 0; i < 10; i++) {
        const pollResponse = await fetch(`${HF_API_URL}/call/predict/${eventId}`);
        const text = await pollResponse.text();
        
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (Array.isArray(data) && data.length > 0) {
                result = data[0];
                break;
              }
            } catch (e) {
              // Continue
            }
          }
        }
        
        if (result) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (result) {
        handleStreamingResult(result, chunkId);
      }

      await FileSystem.deleteAsync(tempUri, { idempotent: true });

    } catch (error) {
      console.error(`Chunk #${chunkId} processing error:`, error);
    }
  }

  // Handle streaming detection result
  function handleStreamingResult(result: string, chunkId: number) {
    console.log(`Result for chunk #${chunkId}:`, result);

    const aiMatch = result.match(/AI Generated[^0-9]*(\d+\.?\d*)%/i);
    const realMatch = result.match(/Real Voice[^0-9]*(\d+\.?\d*)%/i);
    
    const aiPercent = aiMatch ? parseFloat(aiMatch[1]) : 0;
    const realPercent = realMatch ? parseFloat(realMatch[1]) : 0;
    
    const isAI = aiPercent > 30;
    
    const detectionResult: DetectionResult = {
      isAI,
      aiPercent,
      realPercent,
      timestamp: new Date(),
      chunkId,
    };
    
    setLastResult(detectionResult);
    setHistory(prev => [detectionResult, ...prev].slice(0, 20));
    
    if (isAI) {
      consecutiveDetectionsRef.current++;
      
      if (!detectionEvent) {
        setDetectionEvent(true);
        console.log(`AI DETECTION EVENT! Chunk #${chunkId}`);
        
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'AI Audio Detection Event',
            body: `AI voice detected: ${aiPercent}% confidence (streaming)`,
          },
          trigger: null,
        });
      } else {
        console.log(`Continuing detection: ${consecutiveDetectionsRef.current} consecutive chunks`);
      }
    } else {
      if (detectionEvent && consecutiveDetectionsRef.current > 0) {
        console.log(`Detection event ended after ${consecutiveDetectionsRef.current} chunks`);
        setDetectionEvent(false);
        consecutiveDetectionsRef.current = 0;
      }
    }
    
    setStreamingStatus(`Chunk #${chunkId}: ${isAI ? 'AI' : 'Real'} (${aiPercent}% AI)`);
  }

  async function startRecording() {
    try {
      animateButtonPress();
      console.log('Starting streaming recording...');
      
      audioBufferRef.current = [];
      setChunkCount(0);
      consecutiveDetectionsRef.current = 0;
      setDetectionEvent(false);
      isStreamingRef.current = true;
      
      if (isDevelopment) {
        console.log('DEVELOPMENT MODE: Streaming from microphone');
        
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        
        const recordingOptions = {
          android: {
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.DEFAULT,
            audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
            sampleRate: streamingConfig.RATE,
            numberOfChannels: streamingConfig.CHANNELS,
            bitRate: 128000,
          },
          ios: {
            extension: '.wav',
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: streamingConfig.RATE,
            numberOfChannels: streamingConfig.CHANNELS,
            bitDepth: 16,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
            bitRate: 128000, // Added bitRate field
          },
          web: {
            mimeType: 'audio/wav',
            bitsPerSecond: 128000,
          },
        };
        
        const { recording } = await Audio.Recording.createAsync(
          recordingOptions,
          (status) => {
            if (status.isRecording && status.metering !== undefined) {
              // In real streaming, we'd capture audio samples here
            }
          },
          100
        );
        
        recordingRef.current = recording;
        
        Alert.alert(
          'Streaming Mode Active',
          'Recording and analyzing in real-time. Play audio from speakers to test.',
          [{ text: 'OK' }]
        );
      } else {
        const result = await ScreenRecorder.startRecording({ mic: false });
        
        if (result) {
          Alert.alert(
            'Streaming Recording Started',
            'Switch to TikTok/Instagram. Audio will be analyzed in real-time.',
            [{ text: 'Got it!' }]
          );
        }
      }
      
      setIsRecording(true);
      setStreamingStatus('Streaming active - waiting for audio...');
      
      streamingIntervalRef.current = setInterval(() => {
        processStreamingChunk();
      }, streamingConfig.STREAM_INTERVAL);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
      setIsRecording(false);
      isStreamingRef.current = false;
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    
    try {
      animateButtonPress();
      console.log('Stopping streaming recording...');
      isStreamingRef.current = false;
      setIsRecording(false);
      
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }
      
      if (isDevelopment) {
        if (recordingRef.current) {
          await recordingRef.current.stopAndUnloadAsync();
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
          });
          
          const uri = recordingRef.current.getURI();
          if (uri) {
            console.log('Final recording URI:', uri);
            await FileSystem.deleteAsync(uri, { idempotent: true });
          }
          
          recordingRef.current = null;
        }
      } else {
        await ScreenRecorder.stopRecording();
      }
      
      setStreamingStatus('Streaming stopped');
      
      const totalChunks = chunkCount;
      const aiChunks = history.filter(h => h.isAI).length;
      console.log(`Session summary: ${totalChunks} chunks processed, ${aiChunks} AI detections`);
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  if (isLoading) {
    return <LoadingScreen onLoadComplete={() => setIsLoading(false)} />;
  }

  const titleRotate = titleRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {isDevelopment && (
        <View style={styles.devBanner}>
          <Settings size={16} color="white" />
          <Text style={styles.devText}>Development Mode</Text>
          <Text style={styles.devSubtext}>Streaming audio from microphone</Text>
        </View>
      )}
      
      <Animated.View
        style={[
          styles.titleWrapper,
          {
            transform: [
              { scale: titleScaleAnim },
              { rotate: titleRotate },
            ],
          },
        ]}
      >
        <Text style={styles.title}>LION</Text>
      </Animated.View>
      
      <View style={styles.subtitleContainer}>
        <Shield size={16} color="#999" />
        <Text style={styles.subtitle}>Real-time AI Audio Detection</Text>
      </View>
      
      <Animated.View
        style={{
          transform: [{ scale: pulseAnim }],
        }}
      >
        <TouchableOpacity
          style={[
            styles.button,
            isRecording && styles.recordingButton,
            isProcessing && styles.processingButton,
          ]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <ActivityIndicator size="large" color="white" />
          ) : (
            <View style={styles.buttonContent}>
              {isRecording ? (
                <>
                  <MicOff size={24} color="white" strokeWidth={2} />
                  <Text style={styles.buttonText}>Stop Streaming</Text>
                </>
              ) : (
                <>
                  <Mic size={24} color="white" strokeWidth={2} />
                  <Text style={styles.buttonText}>Start Streaming</Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {isRecording && (
        <>
          <View style={styles.streamingContainer}>
            <Radio size={16} color="#FFD700" />
            <Text style={styles.streamingStatus}>{streamingStatus}</Text>
          </View>
          
          <View style={styles.chunkInfoContainer}>
            <Zap size={14} color="#999" />
            <Text style={styles.chunkInfo}>
              Chunks processed: {chunkCount}
            </Text>
          </View>
          
          {detectionEvent && (
            <Animated.View style={styles.alertBanner}>
              <AlertTriangle size={20} color="white" strokeWidth={2} />
              <Text style={styles.alertText}>
                AI VOICE DETECTED - ACTIVE EVENT
              </Text>
            </Animated.View>
          )}
        </>
      )}

      {lastResult && (
        <View style={[
          styles.resultContainer,
          lastResult.isAI ? styles.aiResult : styles.realResult
        ]}>
          <View style={styles.resultHeader}>
            {lastResult.isAI ? (
              <AlertCircle size={20} color="#ff6b6b" strokeWidth={2} />
            ) : (
              <CheckCircle size={20} color="#51cf66" strokeWidth={2} />
            )}
            <Text style={styles.resultTitle}>
              Chunk #{lastResult.chunkId}: {lastResult.isAI ? 'AI Detected' : 'Real Audio'}
            </Text>
          </View>
          <Text style={styles.resultPercent}>
            AI: {lastResult.aiPercent}% | Real: {lastResult.realPercent}%
          </Text>
        </View>
      )}

      {history.length > 0 && (
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Activity size={18} color="#FFD700" />
            <Text style={styles.historyTitle}>Streaming History</Text>
          </View>
          {history.slice(0, 10).map((item, index) => (
            <View key={index} style={styles.historyItem}>
              {item.isAI ? (
                <AlertCircle size={16} color="#ff6b6b" strokeWidth={2} />
              ) : (
                <CheckCircle size={16} color="#51cf66" strokeWidth={2} />
              )}
              <Text style={styles.historyText}>
                Chunk #{item.chunkId}: {item.isAI ? 'AI' : 'Real'} ({item.aiPercent}%)
              </Text>
              <Text style={styles.historyTime}>
                {item.timestamp.toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Loading styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  loadingLetter: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFD700',
    marginHorizontal: 5,
  },
  loadingSubtitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingSubtitleText: {
    color: '#999',
    fontSize: 16,
  },

  // Main app styles
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentContainer: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  devBanner: {
    backgroundColor: '#FF6B6B',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  devText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 5,
  },
  devSubtext: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
  },
  titleWrapper: {
    marginBottom: 10,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFD700',
    letterSpacing: 5,
  },
  subtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 50,
    gap: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  button: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 30,
    minWidth: 220,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordingButton: {
    backgroundColor: '#ff6b6b',
  },
  processingButton: {
    backgroundColor: '#666',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  streamingContainer: {
    marginTop: 20,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  streamingStatus: {
    color: '#FFD700',
    fontSize: 14,
  },
  chunkInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  chunkInfo: {
    color: '#999',
    fontSize: 12,
  },
  alertBanner: {
    backgroundColor: '#ff0000',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    width: '80%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  alertText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  resultContainer: {
    marginTop: 20,
    padding: 15,
    borderRadius: 10,
    width: '80%',
  },
  aiResult: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderColor: '#ff6b6b',
    borderWidth: 2,
  },
  realResult: {
    backgroundColor: 'rgba(81, 207, 102, 0.2)',
    borderColor: '#51cf66',
    borderWidth: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  resultPercent: {
    fontSize: 14,
    color: '#ccc',
    marginLeft: 28,
  },
  historyContainer: {
    marginTop: 40,
    width: '100%',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  historyTitle: {
    fontSize: 18,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 10,
  },
  historyText: {
    color: 'white',
    flex: 1,
    fontSize: 12,
  },
  historyTime: {
    color: '#666',
    fontSize: 11,
  },
});