import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';

// Add type declaration for global
declare global {
  var nativeModulesProxy: any;
}

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
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [history, setHistory] = useState<DetectionResult[]>([]);
  const [devRecording, setDevRecording] = useState<Audio.Recording | null>(null);

  useEffect(() => {
    // Request permissions on mount
    (async () => {
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        Alert.alert('Permission needed', 'Please grant notification permission');
      }

      if (isDevelopment) {
        // Request microphone permission for dev mode
        const { status: audioStatus } = await Audio.requestPermissionsAsync();
        if (audioStatus !== 'granted') {
          Alert.alert('Dev Mode', 'Microphone permission needed for development mode');
        }
      }
    })();
  }, []);

  async function startRecording() {
    try {
      console.log('Starting recording...');
      
      if (isDevelopment) {
        // DEVELOPMENT MODE: Use microphone
        console.log('🔧 DEVELOPMENT MODE: Screen recording simulated, using microphone');
        
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setDevRecording(recording);
        
        Alert.alert(
          'Dev Mode: Recording Started',
          'Using microphone instead of screen recording. Play audio from speakers to test.',
          [{ text: 'OK' }]
        );
      } else {
        // PRODUCTION MODE: Real screen recording
        const result = await ScreenRecorder.startRecording({ mic: false });
        
        if (result) {
          Alert.alert(
            'Recording Started! 🎬',
            'Switch to TikTok/Instagram and browse videos. Come back here to stop recording.',
            [{ text: 'Got it!' }]
          );
        }
      }
      
      setIsRecording(true);
      setProgress(0);
      
      // Progress timer
      let progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + (1 / 30);
          if (newProgress >= 1) {
            clearInterval(progressInterval);
            stopRecording();
          }
          return Math.min(newProgress, 1);
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
      setIsRecording(false);
    }
  }

  async function stopRecording() {
    try {
      console.log('Stopping recording...');
      setIsRecording(false);
      
      let audioPath: string;
      
      if (isDevelopment) {
        // DEVELOPMENT MODE: Stop microphone recording
        console.log('🔧 DEVELOPMENT MODE: Stopping microphone recording');
        
        if (devRecording) {
          await devRecording.stopAndUnloadAsync();
          const uri = devRecording.getURI();
          if (uri) {
            audioPath = uri;
            setDevRecording(null);
          } else {
            throw new Error('No recording URI');
          }
        } else {
          throw new Error('No recording in progress');
        }
      } else {
        // PRODUCTION MODE: Stop screen recording
        const videoPath = await ScreenRecorder.stopRecording();
        console.log('Screen recording saved to:', videoPath);
        
        // In production, you'd extract audio from video here
        // For now, we'll process the video directly
        audioPath = videoPath;
      }
      
      setIsProcessing(true);
      await processAudio(audioPath);
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  }

  async function processAudio(audioPath: string) {
    try {
      console.log('Processing audio:', audioPath);
      
      // Create form data
      const formData = new FormData();
      
      if (isDevelopment) {
        // In dev mode, we have an audio file
        formData.append('files', {
          uri: audioPath,
          type: 'audio/wav',
          name: 'audio.wav',
        } as any);
      } else {
        // In production, we'd have a video file
        // You'd extract audio first, but for now send video
        formData.append('files', {
          uri: Platform.OS === 'ios' ? audioPath.replace('file://', '') : audioPath,
          type: 'video/mp4',
          name: 'recording.mp4',
        } as any);
      }

      // Upload to API
      console.log('Uploading to HuggingFace...');
      const uploadResponse = await fetch(`${HF_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadResult = await uploadResponse.json();
      const filePath = uploadResult[0];

      // Make prediction
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

      // Poll for results
      let result = null;
      for (let i = 0; i < 30; i++) {
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (result) {
        console.log('Got result:', result);
        
        // Extract percentages
        const aiMatch = result.match(/AI Generated[^0-9]*(\d+\.?\d*)%/i);
        const realMatch = result.match(/Real Voice[^0-9]*(\d+\.?\d*)%/i);
        
        const aiPercent = aiMatch ? parseFloat(aiMatch[1]) : 0;
        const realPercent = realMatch ? parseFloat(realMatch[1]) : 0;
        
        const isAI = aiPercent > 50;
        
        const detectionResult: DetectionResult = {
          isAI,
          aiPercent,
          realPercent,
          timestamp: new Date(),
        };
        
        setLastResult(detectionResult);
        setHistory(prev => [detectionResult, ...prev].slice(0, 10)); // Keep last 10
        
        // Show notification if AI detected
        if (isAI) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🚨 AI Audio Detected!',
              body: `AI confidence: ${aiPercent}%`,
            },
            trigger: null,
          });
        }
      }

      // Clean up the file
      try {
        await FileSystem.deleteAsync(audioPath, { idempotent: true });
        console.log('Cleaned up recording file');
      } catch (e) {
        console.log('Could not delete file:', e);
      }

    } catch (error) {
      console.error('Processing error:', error);
      Alert.alert('Error', 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {isDevelopment && (
        <View style={styles.devBanner}>
          <Text style={styles.devText}>🔧 Development Mode</Text>
          <Text style={styles.devSubtext}>Screen recording simulated with microphone</Text>
        </View>
      )}
      
      <Text style={styles.title}>Lion Audio Detector</Text>
      <Text style={styles.subtitle}>
        {isDevelopment ? 'Microphone Mode' : 'Screen Recording Mode'}
      </Text>
      
      <TouchableOpacity
        style={[
          styles.button,
          isRecording && styles.recordingButton,
          isProcessing && styles.processingButton,
        ]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator size="large" color="white" />
        ) : (
          <Text style={styles.buttonText}>
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </Text>
        )}
      </TouchableOpacity>

      {isRecording && (
        <>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(progress * 30)}s / 30s
            </Text>
          </View>
          <Text style={styles.recordingHint}>
            {isDevelopment 
              ? '🎤 Play audio from speakers'
              : '📱 Switch to TikTok/Instagram now!'}
          </Text>
        </>
      )}

      {isProcessing && (
        <Text style={styles.statusText}>Analyzing audio for AI content...</Text>
      )}

      {lastResult && !isRecording && !isProcessing && (
        <View style={[
          styles.resultContainer,
          lastResult.isAI ? styles.aiResult : styles.realResult
        ]}>
          <Text style={styles.resultTitle}>
            {lastResult.isAI ? '🚨 AI Generated' : '✅ Real Audio'}
          </Text>
          <Text style={styles.resultPercent}>
            AI: {lastResult.aiPercent}% | Real: {lastResult.realPercent}%
          </Text>
        </View>
      )}

      {history.length > 0 && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>Recent Detections</Text>
          {history.map((item, index) => (
            <View key={index} style={styles.historyItem}>
              <Text style={styles.historyIcon}>
                {item.isAI ? '🚨' : '✅'}
              </Text>
              <Text style={styles.historyText}>
                {item.isAI ? 'AI' : 'Real'} ({item.aiPercent}%)
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
  },
  devText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  devSubtext: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 50,
  },
  button: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 30,
    minWidth: 200,
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
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressContainer: {
    marginTop: 30,
    alignItems: 'center',
    width: '100%',
  },
  progressBar: {
    width: '80%',
    height: 10,
    backgroundColor: '#333',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD700',
  },
  progressText: {
    color: '#999',
    marginTop: 10,
  },
  recordingHint: {
    color: '#FFD700',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  statusText: {
    color: '#FFD700',
    marginTop: 20,
  },
  resultContainer: {
    marginTop: 30,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
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
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  resultPercent: {
    fontSize: 16,
    color: '#ccc',
  },
  historyContainer: {
    marginTop: 40,
    width: '100%',
  },
  historyTitle: {
    fontSize: 18,
    color: '#FFD700',
    marginBottom: 15,
    fontWeight: 'bold',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  historyIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  historyText: {
    color: 'white',
    flex: 1,
  },
  historyTime: {
    color: '#666',
    fontSize: 12,
  },
});