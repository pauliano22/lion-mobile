import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';

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

export default function App() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<{
    isAI: boolean;
    aiPercent: number;
    realPercent: number;
  } | null>(null);

  useEffect(() => {
    // Request permissions on mount
    (async () => {
      const { status: audioStatus } = await Audio.requestPermissionsAsync();
      if (audioStatus !== 'granted') {
        Alert.alert('Permission needed', 'Please grant microphone permission');
      }

      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        Alert.alert('Permission needed', 'Please grant notification permission');
      }
    })();
  }, []);

  async function startRecording() {
    try {
      console.log('Requesting permissions..');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 2, // DuckOthers
        shouldDuckAndroid: true,
        interruptionModeAndroid: 2, // DuckOthers
        playThroughEarpieceAndroid: false,
      });
      
      console.log('Starting recording..');
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setProgress(0);

      // Monitor progress
      const interval = setInterval(async () => {
        const status = await recording.getStatusAsync();
        if (status.isRecording) {
          const prog = Math.min(status.durationMillis / 30000, 1);
          setProgress(prog);
          
          if (status.durationMillis >= 30000) {
            clearInterval(interval);
            stopRecording();
          }
        }
      }, 100);

      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    
    console.log('Stopping recording..');
    setRecording(null);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
    const uri = recording.getURI();
    console.log('Recording stopped and stored at', uri);
    
    if (uri) {
      setIsProcessing(true);
      await processAudio(uri);
    }
  }

  async function processAudio(audioUri: string) {
    try {
      console.log('Processing audio...');
      
      // Create form data
      const formData = new FormData();
      formData.append('files', {
        uri: audioUri,
        type: 'audio/wav',
        name: 'audio.wav',
      } as any);

      // Upload file
      console.log('Uploading to:', `${HF_API_URL}/upload`);
      const uploadResponse = await fetch(`${HF_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      console.log('Upload response status:', uploadResponse.status);
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Upload error:', errorText);
        throw new Error('Upload failed');
      }

      const uploadResult = await uploadResponse.json();
      console.log('Upload result:', uploadResult);
      const filePath = uploadResult[0];

      // Make prediction
      console.log('Making prediction...');
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
      console.log('Prediction response:', predictionResult);
      const eventId = predictionResult.event_id;

      // Poll for results
      console.log('Polling for results with event ID:', eventId);
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
        
        // Extract percentages from the result
        const aiMatch = result.match(/AI Generated[^0-9]*(\d+\.?\d*)%/i);
        const realMatch = result.match(/Real Voice[^0-9]*(\d+\.?\d*)%/i);
        
        const aiPercent = aiMatch ? parseFloat(aiMatch[1]) : 0;
        const realPercent = realMatch ? parseFloat(realMatch[1]) : 0;
        
        const isAI = aiPercent > 50; // Only consider it AI if > 50%
        
        console.log(`AI: ${aiPercent}%, Real: ${realPercent}%`);
        
        // Only show notification if it's AI-generated (> 50%)
        if (isAI) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🚨 AI Audio Detected!',
              body: `AI confidence: ${aiPercent}%`,
            },
            trigger: null,
          });
        }
        
        // Update the UI to show the result
        setProgress(0); // Reset progress
        setLastResult({
          isAI,
          aiPercent,
          realPercent
        });
      } else {
        console.log('No result received after polling');
      }

    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to process audio');
    } finally {
      setIsProcessing(false);
      
      // Cleanup
      try {
        await FileSystem.deleteAsync(audioUri, { idempotent: true });
      } catch (e) {
        console.log('Cleanup error:', e);
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lion Audio Detector</Text>
      
      <TouchableOpacity
        style={[
          styles.button,
          recording && styles.recordingButton,
          isProcessing && styles.processingButton,
        ]}
        onPress={recording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator size="large" color="white" />
        ) : (
          <Text style={styles.buttonText}>
            {recording ? 'Stop Recording' : 'Start Recording'}
          </Text>
        )}
      </TouchableOpacity>

      {recording && (
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
      )}

      {isProcessing && (
        <Text style={styles.statusText}>Processing audio...</Text>
      )}

      {lastResult && !recording && !isProcessing && (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 50,
  },
  button: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 30,
    minWidth: 200,
    alignItems: 'center',
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
    width: '80%',
  },
  progressBar: {
    width: '100%',
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
});