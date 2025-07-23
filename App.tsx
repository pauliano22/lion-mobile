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
} from 'lucide-react-native';

// Add type declaration for global
declare global {
  var nativeModulesProxy: any;
}

const { width, height } = Dimensions.get('window');

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

// Enhanced Loading Screen Component
function LoadingScreen({ onLoadComplete }: { onLoadComplete: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shieldScale = useRef(new Animated.Value(0)).current;
  const shieldRotate = useRef(new Animated.Value(0)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  
  // Individual letter animations with enhanced O animation
  const letterAnims = useRef({
    L: { translateY: new Animated.Value(30), opacity: new Animated.Value(0) },
    I: { translateY: new Animated.Value(30), opacity: new Animated.Value(0) },
    O: { 
      translateY: new Animated.Value(30), 
      opacity: new Animated.Value(0), 
      rotate: new Animated.Value(0),
      scale: new Animated.Value(0.5)
    },
    N: { translateY: new Animated.Value(30), opacity: new Animated.Value(0) },
  }).current;

  useEffect(() => {
    // Smooth entrance sequence
    Animated.sequence([
      // Fade in background
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      // Shield entrance with bounce
      Animated.spring(shieldScale, {
        toValue: 1,
        tension: 20,
        friction: 5,
        useNativeDriver: true,
      }),
      // Animate letters with stagger
      Animated.stagger(150, [
        Animated.parallel([
          Animated.spring(letterAnims.L.translateY, {
            toValue: 0,
            tension: 40,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(letterAnims.L.opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.spring(letterAnims.I.translateY, {
            toValue: 0,
            tension: 40,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(letterAnims.I.opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        // Enhanced O animation
        Animated.parallel([
          Animated.spring(letterAnims.O.translateY, {
            toValue: 0,
            tension: 30,
            friction: 5,
            useNativeDriver: true,
          }),
          Animated.timing(letterAnims.O.opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          // Multiple rotations with scale
          Animated.sequence([
            Animated.parallel([
              Animated.timing(letterAnims.O.rotate, {
                toValue: 2, // 720 degrees
                duration: 1200,
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
              }),
              Animated.sequence([
                Animated.timing(letterAnims.O.scale, {
                  toValue: 1.3,
                  duration: 600,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(letterAnims.O.scale, {
                  toValue: 1,
                  duration: 600,
                  easing: Easing.in(Easing.quad),
                  useNativeDriver: true,
                }),
              ]),
            ]),
          ]),
        ]),
        Animated.parallel([
          Animated.spring(letterAnims.N.translateY, {
            toValue: 0,
            tension: 40,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(letterAnims.N.opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Underline animation
      Animated.timing(lineWidth, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Shield continuous rotation
      Animated.loop(
        Animated.timing(shieldRotate, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
      
      // Complete after animation
      setTimeout(onLoadComplete, 800);
    });
  }, []);

  const shieldSpin = shieldRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const oSpin = letterAnims.O.rotate.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '360deg', '720deg'],
  });

  return (
    <View style={styles.loadingContainer}>
      <Animated.View
        style={[
          styles.loadingContent,
          { opacity: fadeAnim }
        ]}
      >
        <Animated.View
          style={[
            styles.shieldContainer,
            {
              transform: [
                { scale: shieldScale },
                { rotate: shieldSpin }
              ],
            },
          ]}
        >
          <Shield size={60} color="#FFD700" strokeWidth={1} />
        </Animated.View>

        <View style={styles.letterContainer}>
          <Animated.Text
            style={[
              styles.loadingLetter,
              {
                opacity: letterAnims.L.opacity,
                transform: [{ translateY: letterAnims.L.translateY }],
              },
            ]}
          >
            L
          </Animated.Text>
          <Animated.Text
            style={[
              styles.loadingLetter,
              {
                opacity: letterAnims.I.opacity,
                transform: [{ translateY: letterAnims.I.translateY }],
              },
            ]}
          >
            I
          </Animated.Text>
          <Animated.Text
            style={[
              styles.loadingLetter,
              styles.loadingLetter,
              {
                opacity: letterAnims.O.opacity,
                transform: [
                  { translateY: letterAnims.O.translateY },
                  { rotate: oSpin },
                  { scale: letterAnims.O.scale }
                ],
              },
            ]}
          >
            O
          </Animated.Text>
          <Animated.Text
            style={[
              styles.loadingLetter,
              {
                opacity: letterAnims.N.opacity,
                transform: [{ translateY: letterAnims.N.translateY }],
              },
            ]}
          >
            N
          </Animated.Text>
        </View>

        <Animated.View
          style={[
            styles.underline,
            {
              width: lineWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '80%'],
              }),
            },
          ]}
        />

        <Animated.Text
          style={[
            styles.tagline,
            { opacity: lineWidth }
          ]}
        >
          AI Audio Detection
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

// Minimal Button Component
function MinimalButton({ onPress, isRecording, isProcessing }: any) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const borderWidth = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    // Button animation sequence
    Animated.sequence([
      // Scale down slightly
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      // Spring back with border pulse
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
        // Border pulse effect
        Animated.sequence([
          Animated.timing(borderWidth, {
            toValue: 3,
            duration: 200,
            useNativeDriver: false,
          }),
          Animated.timing(borderWidth, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
        // Glow effect
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    onPress();
  };

  return (
    <View style={styles.buttonWrapper}>
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.buttonGlow,
          {
            opacity: glowOpacity,
          },
        ]}
      />
      
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
        }}
      >
        <TouchableOpacity
          onPress={handlePress}
          disabled={isProcessing}
          activeOpacity={0.9}
        >
          <Animated.View
            style={[
              styles.button,
              isRecording && styles.minimalButtonRecording,
              isProcessing && styles.minimalButtonProcessing,
              {
                borderWidth: borderWidth,
              },
            ]}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFD700" />
            ) : (
              <View style={styles.buttonContent}>
                {isRecording ? (
                  <>
                    <MicOff size={20} color="#FFD700" strokeWidth={1} />
                    <Text style={styles.minimalButtonText}>STOP</Text>
                  </>
                ) : (
                  <>
                    <Mic size={20} color="#FFD700" strokeWidth={1} />
                    <Text style={styles.minimalButtonText}>START</Text>
                  </>
                )}
              </View>
            )}
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  
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

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading) {
      // Fade in main content
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
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
      setStreamingStatus(`Buffering... (${bufferDuration.toFixed(1)}s / ${streamingConfig.CHUNK_DURATION}s)`);
      return;
    }

    const volume = calculateRMS(bufferCopy);
    if (volume < streamingConfig.MIN_VOLUME_THRESHOLD) {
      setStreamingStatus(`Audio too quiet`);
      return;
    }

    const samplesNeeded = Math.floor(streamingConfig.CHUNK_DURATION * streamingConfig.RATE);
    const chunkData = bufferCopy.slice(-samplesNeeded);

    const currentChunkId = chunkCount + 1;
    setChunkCount(currentChunkId);
    setStreamingStatus(`Processing chunk #${currentChunkId}`);

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
            body: `AI voice detected: ${aiPercent}% confidence`,
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
    
    setStreamingStatus(`Chunk #${chunkId}: ${isAI ? 'AI Detected' : 'Real Audio'}`);
  }

  async function startRecording() {
    try {
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
            bitRate: 128000,
            bitDepth: 16,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
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
          'Streaming Active',
          'Real-time analysis enabled. Play audio to test.',
          [{ text: 'OK' }]
        );
      } else {
        const result = await ScreenRecorder.startRecording({ mic: false });
        
        if (result) {
          Alert.alert(
            'Streaming Started',
            'Switch to your target app. Audio will be analyzed in real-time.',
            [{ text: 'OK' }]
          );
        }
      }
      
      setIsRecording(true);
      setStreamingStatus('Waiting for audio...');
      
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
      
      setStreamingStatus('Stopped');
      
      const totalChunks = chunkCount;
      const aiChunks = history.filter(h => h.isAI).length;
      console.log(`Session: ${totalChunks} chunks, ${aiChunks} AI detections`);
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  if (isLoading) {
    return <LoadingScreen onLoadComplete={() => setIsLoading(false)} />;
  }

  return (
    <Animated.ScrollView 
      style={[styles.container, { opacity: fadeAnim }]} 
      contentContainerStyle={styles.contentContainer}
    >
      {isDevelopment && (
        <View style={styles.devBanner}>
          <Settings size={14} color="white" strokeWidth={1.5} />
          <Text style={styles.devText}>Development Mode</Text>
        </View>
      )}
      
      <View style={styles.header}>
        <Text style={styles.title}>LION</Text>
        <View style={styles.subtitleRow}>
          <Shield size={14} color="#666" strokeWidth={1.5} />
          <Text style={styles.subtitle}>AI AUDIO DETECTION</Text>
        </View>
      </View>
      
      <MinimalButton
        onPress={isRecording ? stopRecording : startRecording}
        isRecording={isRecording}
        isProcessing={isProcessing}
      />

      {isRecording && (
        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            <Radio size={14} color="#FFD700" strokeWidth={1.5} />
            <Text style={styles.statusText}>{streamingStatus}</Text>
          </View>
          
          <View style={styles.chunkRow}>
            <Zap size={12} color="#666" strokeWidth={1.5} />
            <Text style={styles.chunkText}>Chunks: {chunkCount}</Text>
          </View>
          
          {detectionEvent && (
            <View style={styles.alertBanner}>
              <AlertTriangle size={18} color="white" strokeWidth={1.5} />
              <Text style={styles.alertText}>AI VOICE DETECTED</Text>
            </View>
          )}
        </View>
      )}

      {lastResult && (
        <View style={[
          styles.resultCard,
          lastResult.isAI ? styles.aiCard : styles.realCard
        ]}>
          <View style={styles.resultHeader}>
            {lastResult.isAI ? (
              <AlertCircle size={18} color="#ff0000" strokeWidth={1.5} />
            ) : (
              <CheckCircle size={18} color="#00ff00" strokeWidth={1.5} />
            )}
            <Text style={styles.resultTitle}>
              {lastResult.isAI ? 'AI DETECTED' : 'REAL AUDIO'}
            </Text>
          </View>
          <Text style={styles.resultStats}>
            AI: {lastResult.aiPercent}% • REAL: {lastResult.realPercent}%
          </Text>
        </View>
      )}

      {history.length > 0 && (
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Activity size={16} color="#FFD700" strokeWidth={1.5} />
            <Text style={styles.historyTitle}>RECENT ACTIVITY</Text>
          </View>
          <View style={styles.historyList}>
            {history.slice(0, 5).map((item, index) => (
              <View key={index} style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  {item.isAI ? (
                    <AlertCircle size={14} color="#ff0000" strokeWidth={1.5} />
                  ) : (
                    <CheckCircle size={14} color="#00ff00" strokeWidth={1.5} />
                  )}
                </View>
                <Text style={styles.historyText}>
                  #{item.chunkId} • {item.aiPercent}% AI
                </Text>
                <Text style={styles.historyTime}>
                  {item.timestamp.toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  // Loading styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  shieldContainer: {
    marginBottom: 40,
  },
  minimalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 3,
  },
  buttonGlow: {
    position: 'absolute',
    width: 140,
    height: 75,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 215, 0, 0.5)',
  },
  minimalButtonRecording: {
    backgroundColor: '#ff0000',
  },
  minimalButtonProcessing: {
    backgroundColor: '#333',
    opacity: 0.6,
  },
  letterContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  loadingLetter: {
    fontSize: 56,
    fontWeight: '300',
    color: '#FFD700',
    marginHorizontal: 8,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  underline: {
    height: 2,
    backgroundColor: '#FFD700',
    marginBottom: 30,
  },
  tagline: {
    color: '#666',
    fontSize: 14,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  // Main app styles
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  contentContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  devBanner: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#ff0000',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginBottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devText: {
    color: '#ff0000',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 64,
    fontWeight: '200',
    color: '#FFD700',
    letterSpacing: 12,
    marginBottom: 12,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    letterSpacing: 4,
  },

  // Button styles
  buttonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 50,
  },
  button: {
    backgroundColor: 'black',
    paddingHorizontal: 15,
    paddingVertical: 18,
    borderRadius: 50,
    minWidth: 100,
    alignItems: 'center',
    borderColor: '#FFD700',
  },
  recordingButton: {
    backgroundColor: '#ff0000',
  },
  processingButton: {
    backgroundColor: '#333',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 3,
  },

  // Ripple styles
  ripple: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
  },
  rippleRed: {
    borderColor: '#ff0000',
  },
  rippleBlack: {
    borderColor: '#000000',
  },

  // Status styles
  statusContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    color: '#FFD700',
    fontSize: 14,
    letterSpacing: 1,
  },
  chunkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chunkText: {
    color: '#666',
    fontSize: 12,
    letterSpacing: 1,
  },

  // Alert banner
  alertBanner: {
    backgroundColor: '#ff0000',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertText: {
    color: 'white',
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: '300',
  },

  // Result card
  resultCard: {
    width: '100%',
    padding: 20,
    borderRadius: 4,
    marginBottom: 30,
    borderWidth: 1,
  },
  aiCard: {
    backgroundColor: 'rgba(255, 0, 0, 0.05)',
    borderColor: '#ff0000',
  },
  realCard: {
    backgroundColor: 'rgba(0, 255, 0, 0.05)',
    borderColor: '#00ff00',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  resultTitle: {
    color: 'white',
    fontSize: 16,
    letterSpacing: 2,
    fontWeight: '300',
  },
  resultStats: {
    color: '#666',
    fontSize: 12,
    letterSpacing: 1,
    marginLeft: 28,
  },

  // History section
  historySection: {
    width: '100%',
    marginTop: 20,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  historyTitle: {
    color: '#FFD700',
    fontSize: 14,
    letterSpacing: 3,
    fontWeight: '300',
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyIcon: {
    marginRight: 12,
  },
  historyText: {
    color: '#999',
    fontSize: 12,
    flex: 1,
    letterSpacing: 1,
  },
  historyTime: {
    color: '#444',
    fontSize: 11,
  },
});