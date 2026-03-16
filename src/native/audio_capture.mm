#import <AudioToolbox/AudioToolbox.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreMedia/CoreMedia.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

#include <cmath>
#include <mutex>
#include <string>
#include <vector>

#include <napi.h>

#include "wav_writer.h"

// ---------------------------------------------------------------------------
// SCStream delegate
// ---------------------------------------------------------------------------

@class ScribeStreamOutput;

// ---------------------------------------------------------------------------
// AudioCapture – core state
// ---------------------------------------------------------------------------

struct AudioCapture {
  // Config
  uint32_t sampleRate = 48000;
  uint16_t channels = 2;
  double segmentDurationSec = 30.0;
  std::string outputDir;

  // Mic (AudioQueue)
  bool micRunning = false;

  // System audio (ScreenCaptureKit)
  SCStream *scStream = nil;
  ScribeStreamOutput *scDelegate = nil;
  bool systemRunning = false;

  // Buffers (protected by mutex)
  std::mutex bufferMutex;
  std::vector<float> micBuffer;
  std::vector<float> systemBuffer;
  std::vector<float> mixedBuffer;

  // WAV output
  WavWriter wavWriter;
  int segmentIndex = 0;
  size_t framesInSegment = 0;
  size_t segmentFrameLimit = 0; // computed at start

  // Level metering
  float currentRMS = 0.0f;

  // Thread-safe callbacks
  Napi::ThreadSafeFunction tsfnStatus;
  Napi::ThreadSafeFunction tsfnLevel;
  Napi::ThreadSafeFunction tsfnSegment;

  bool isRecording = false;
};

static AudioCapture gCapture;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static std::string SegmentPath(const std::string &dir, int index) {
  char buf[512];
  snprintf(buf, sizeof(buf), "%s/segment_%04d.wav", dir.c_str(), index);
  return std::string(buf);
}

// Compute RMS of interleaved float samples
static float ComputeRMS(const float *data, size_t count) {
  if (count == 0)
    return 0.0f;
  double sum = 0.0;
  for (size_t i = 0; i < count; i++) {
    sum += static_cast<double>(data[i]) * data[i];
  }
  return static_cast<float>(std::sqrt(sum / count));
}

// ---------------------------------------------------------------------------
// Flush mixed buffer to WAV, emit segment callback
// ---------------------------------------------------------------------------

static void FlushSegment(bool isFinal) {
  auto &c = gCapture;

  if (!c.wavWriter.isOpen() || c.framesInSegment == 0) {
    return;
  }

  c.wavWriter.finalize();

  std::string path = SegmentPath(c.outputDir, c.segmentIndex);
  int idx = c.segmentIndex;

  // Emit segment path via ThreadSafeFunction
  if (c.tsfnSegment) {
    auto callback = [path, idx](Napi::Env env, Napi::Function fn) {
      auto obj = Napi::Object::New(env);
      obj.Set("path", Napi::String::New(env, path));
      obj.Set("index", Napi::Number::New(env, idx));
      fn.Call({obj});
    };
    c.tsfnSegment.NonBlockingCall(callback);
  }

  if (!isFinal) {
    c.segmentIndex++;
    c.framesInSegment = 0;
    std::string newPath = SegmentPath(c.outputDir, c.segmentIndex);
    c.wavWriter.open(newPath);
  }
}

// ---------------------------------------------------------------------------
// Process mixed audio: write to WAV, compute levels
// ---------------------------------------------------------------------------

static void ProcessMixedAudio(const float *data, size_t frameCount) {
  auto &c = gCapture;

  if (!c.isRecording)
    return;

  // Write to current WAV segment
  if (c.wavWriter.isOpen()) {
    c.wavWriter.write(data, frameCount);
    c.framesInSegment += frameCount;

    // Check segment boundary
    if (c.framesInSegment >= c.segmentFrameLimit) {
      FlushSegment(false);
    }
  }

  // Compute RMS for level metering
  size_t sampleCount = frameCount * c.channels;
  c.currentRMS = ComputeRMS(data, sampleCount);
}

// ---------------------------------------------------------------------------
// Mix mic and system buffers
// ---------------------------------------------------------------------------

static void MixAndProcess() {
  auto &c = gCapture;
  std::lock_guard<std::mutex> lock(c.bufferMutex);

  if (c.micBuffer.empty() && c.systemBuffer.empty()) {
    return;
  }

  // Determine mix length: use whichever buffer has data
  // If both have data, mix to the shorter length
  size_t micSamples = c.micBuffer.size();
  size_t sysSamples = c.systemBuffer.size();

  if (micSamples > 0 && sysSamples > 0) {
    size_t mixLen = std::min(micSamples, sysSamples);
    c.mixedBuffer.resize(mixLen);
    for (size_t i = 0; i < mixLen; i++) {
      c.mixedBuffer[i] = 0.5f * c.micBuffer[i] + 0.5f * c.systemBuffer[i];
    }

    // Remove consumed samples
    c.micBuffer.erase(c.micBuffer.begin(),
                      c.micBuffer.begin() + static_cast<long>(mixLen));
    c.systemBuffer.erase(c.systemBuffer.begin(),
                         c.systemBuffer.begin() + static_cast<long>(mixLen));

    size_t frameCount = mixLen / c.channels;
    ProcessMixedAudio(c.mixedBuffer.data(), frameCount);
  } else if (micSamples > 0) {
    // Only mic data — use it directly (system audio not available)
    size_t frameCount = micSamples / c.channels;
    ProcessMixedAudio(c.micBuffer.data(), frameCount);
    c.micBuffer.clear();
  } else {
    // Only system data
    size_t frameCount = sysSamples / c.channels;
    ProcessMixedAudio(c.systemBuffer.data(), frameCount);
    c.systemBuffer.clear();
  }
}

// ---------------------------------------------------------------------------
// Start/Stop Mic (using AudioQueue for simplicity and reliability)
// ---------------------------------------------------------------------------

static AudioQueueRef gMicQueue = nullptr;
static const int kMicBufferCount = 3;
static const int kMicBufferFrames = 4800; // 100ms at 48kHz

static void MicInputCallback(void * /*userData*/,
                              AudioQueueRef /*queue*/,
                              AudioQueueBufferRef buffer,
                              const AudioTimeStamp * /*startTime*/,
                              UInt32 numPackets,
                              const AudioStreamPacketDescription * /*desc*/) {
  if (!gCapture.isRecording || numPackets == 0)
    return;

  auto *floatData = reinterpret_cast<const float *>(buffer->mAudioData);
  size_t sampleCount = numPackets * gCapture.channels;

  {
    std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
    gCapture.micBuffer.insert(gCapture.micBuffer.end(), floatData,
                              floatData + sampleCount);
  }

  MixAndProcess();

  // Re-enqueue buffer
  if (gMicQueue) {
    AudioQueueEnqueueBuffer(gMicQueue, buffer, 0, nullptr);
  }
}

static bool StartMic() {
  AudioStreamBasicDescription fmt = {};
  fmt.mSampleRate = gCapture.sampleRate;
  fmt.mFormatID = kAudioFormatLinearPCM;
  fmt.mFormatFlags =
      kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
  fmt.mChannelsPerFrame = gCapture.channels;
  fmt.mBitsPerChannel = 32;
  fmt.mBytesPerFrame = fmt.mChannelsPerFrame * (fmt.mBitsPerChannel / 8);
  fmt.mFramesPerPacket = 1;
  fmt.mBytesPerPacket = fmt.mBytesPerFrame;

  OSStatus status =
      AudioQueueNewInput(&fmt, MicInputCallback, nullptr,
                         CFRunLoopGetMain(), kCFRunLoopCommonModes, 0,
                         &gMicQueue);
  if (status != noErr) {
    return false;
  }

  UInt32 bufferSize = kMicBufferFrames * fmt.mBytesPerFrame;
  for (int i = 0; i < kMicBufferCount; i++) {
    AudioQueueBufferRef buffer;
    AudioQueueAllocateBuffer(gMicQueue, bufferSize, &buffer);
    AudioQueueEnqueueBuffer(gMicQueue, buffer, 0, nullptr);
  }

  status = AudioQueueStart(gMicQueue, nullptr);
  if (status != noErr) {
    AudioQueueDispose(gMicQueue, true);
    gMicQueue = nullptr;
    return false;
  }

  gCapture.micRunning = true;
  return true;
}

static void StopMic() {
  if (gMicQueue) {
    AudioQueueStop(gMicQueue, true);
    AudioQueueDispose(gMicQueue, true);
    gMicQueue = nullptr;
  }
  gCapture.micRunning = false;
}

// ---------------------------------------------------------------------------
// ScreenCaptureKit delegate
// ---------------------------------------------------------------------------

@interface ScribeStreamOutput : NSObject <SCStreamOutput, SCStreamDelegate>
@end

@implementation ScribeStreamOutput

- (void)stream:(SCStream *)stream
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
                   ofType:(SCStreamOutputType)type {
  (void)stream;
  if (type != SCStreamOutputTypeAudio)
    return;
  if (!gCapture.isRecording)
    return;

  CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
  if (!blockBuffer)
    return;

  size_t length = 0;
  char *dataPointer = nullptr;
  OSStatus status = CMBlockBufferGetDataPointer(blockBuffer, 0, nullptr,
                                                 &length, &dataPointer);
  if (status != noErr || !dataPointer)
    return;

  // Audio comes as float32 interleaved
  auto *floatData = reinterpret_cast<const float *>(dataPointer);
  size_t sampleCount = length / sizeof(float);

  {
    std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
    gCapture.systemBuffer.insert(gCapture.systemBuffer.end(), floatData,
                                 floatData + sampleCount);
  }

  MixAndProcess();
}

- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
  (void)stream;
  NSLog(@"[Scribe] SCStream stopped with error: %@", error);
  gCapture.systemRunning = false;

  if (gCapture.tsfnStatus) {
    std::string errMsg = error.localizedDescription.UTF8String ?: "Unknown error";
    auto callback = [errMsg](Napi::Env env, Napi::Function fn) {
      auto obj = Napi::Object::New(env);
      obj.Set("state", Napi::String::New(env, "error"));
      obj.Set("error", Napi::String::New(env, errMsg));
      fn.Call({obj});
    };
    gCapture.tsfnStatus.NonBlockingCall(callback);
  }
}

@end

// ---------------------------------------------------------------------------
// Start/Stop System Audio
// ---------------------------------------------------------------------------

static void StartSystemAudio(std::function<void(bool, std::string)> completion) {
  [SCShareableContent
      getShareableContentExcludingDesktopWindows:NO
                             onScreenWindowsOnly:NO
                               completionHandler:^(
                                   SCShareableContent *content,
                                   NSError *error) {
                                 if (error || !content) {
                                   std::string errMsg = "Screen capture permission denied";
                                   if (error) {
                                     errMsg = error.localizedDescription.UTF8String ?: errMsg;
                                   }
                                   completion(false, errMsg);
                                   return;
                                 }

                                 // Capture entire display audio
                                 SCDisplay *display = content.displays.firstObject;
                                 if (!display) {
                                   completion(false, "No display found");
                                   return;
                                 }

                                 SCContentFilter *filter = [[SCContentFilter alloc]
                                     initWithDisplay:display
                                    excludingWindows:@[]];

                                 SCStreamConfiguration *config =
                                     [[SCStreamConfiguration alloc] init];
                                 config.capturesAudio = YES;
                                 config.excludesCurrentProcessAudio = YES;
                                 config.sampleRate = gCapture.sampleRate;
                                 config.channelCount = gCapture.channels;

                                 // Minimize video overhead since we only want audio
                                 config.width = 2;
                                 config.height = 2;
                                 config.minimumFrameInterval =
                                     CMTimeMake(1, 1); // 1 fps minimum

                                 gCapture.scDelegate =
                                     [[ScribeStreamOutput alloc] init];
                                 gCapture.scStream =
                                     [[SCStream alloc] initWithFilter:filter
                                                        configuration:config
                                                             delegate:gCapture.scDelegate];

                                 NSError *addOutputError = nil;
                                 [gCapture.scStream
                                     addStreamOutput:gCapture.scDelegate
                                                type:SCStreamOutputTypeAudio
                                  sampleHandlerQueue:dispatch_get_global_queue(
                                                         DISPATCH_QUEUE_PRIORITY_HIGH, 0)
                                               error:&addOutputError];

                                 if (addOutputError) {
                                   completion(false, addOutputError.localizedDescription
                                                         .UTF8String);
                                   return;
                                 }

                                 [gCapture.scStream
                                     startCaptureWithCompletionHandler:^(
                                         NSError *startError) {
                                       if (startError) {
                                         completion(
                                             false,
                                             startError.localizedDescription
                                                 .UTF8String);
                                       } else {
                                         gCapture.systemRunning = true;
                                         completion(true, "");
                                       }
                                     }];
                               }];
}

static void StopSystemAudio(std::function<void()> completion) {
  if (gCapture.scStream) {
    [gCapture.scStream
        stopCaptureWithCompletionHandler:^(NSError * /*error*/) {
          gCapture.scStream = nil;
          gCapture.scDelegate = nil;
          gCapture.systemRunning = false;
          completion();
        }];
  } else {
    gCapture.systemRunning = false;
    completion();
  }
}

// ---------------------------------------------------------------------------
// Level reporting timer
// ---------------------------------------------------------------------------

static dispatch_source_t gLevelTimer = nullptr;

static void StartLevelTimer() {
  gLevelTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
                                       dispatch_get_global_queue(
                                           DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));
  // ~10 Hz
  dispatch_source_set_timer(gLevelTimer, dispatch_time(DISPATCH_TIME_NOW, 0),
                            100 * NSEC_PER_MSEC, 10 * NSEC_PER_MSEC);

  dispatch_source_set_event_handler(gLevelTimer, ^{
    if (!gCapture.isRecording)
      return;
    float rms = gCapture.currentRMS;
    if (gCapture.tsfnLevel) {
      auto callback = [rms](Napi::Env env, Napi::Function fn) {
        auto obj = Napi::Object::New(env);
        obj.Set("rms", Napi::Number::New(env, rms));
        fn.Call({obj});
      };
      gCapture.tsfnLevel.NonBlockingCall(callback);
    }
  });

  dispatch_resume(gLevelTimer);
}

static void StopLevelTimer() {
  if (gLevelTimer) {
    dispatch_source_cancel(gLevelTimer);
    gLevelTimer = nullptr;
  }
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

static Napi::Value StartRecording(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (gCapture.isRecording) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, "Already recording"));
    return result;
  }

  // Get output directory from argument
  if (info.Length() < 1 || !info[0].IsString()) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error",
               Napi::String::New(env, "Output directory path required"));
    return result;
  }

  gCapture.outputDir = info[0].As<Napi::String>().Utf8Value();
  gCapture.segmentIndex = 0;
  gCapture.framesInSegment = 0;
  gCapture.segmentFrameLimit =
      static_cast<size_t>(gCapture.sampleRate * gCapture.segmentDurationSec);
  gCapture.currentRMS = 0.0f;

  {
    std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
    gCapture.micBuffer.clear();
    gCapture.systemBuffer.clear();
    gCapture.mixedBuffer.clear();
  }

  // Open first WAV segment
  std::string firstPath = SegmentPath(gCapture.outputDir, 0);
  if (!gCapture.wavWriter.open(firstPath)) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error",
               Napi::String::New(env, "Failed to open WAV file: " + firstPath));
    return result;
  }

  gCapture.isRecording = true;

  // Start mic capture
  if (!StartMic()) {
    NSLog(@"[Scribe] Warning: Mic capture failed to start");
  }

  // Start level reporting
  StartLevelTimer();

  // Start system audio (async)
  StartSystemAudio([](bool success, std::string error) {
    if (!success) {
      NSLog(@"[Scribe] Warning: System audio failed: %s", error.c_str());
    }
  });

  // Emit recording status
  if (gCapture.tsfnStatus) {
    auto callback = [](Napi::Env env, Napi::Function fn) {
      auto obj = Napi::Object::New(env);
      obj.Set("state", Napi::String::New(env, "recording"));
      fn.Call({obj});
    };
    gCapture.tsfnStatus.NonBlockingCall(callback);
  }

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  return result;
}

static Napi::Value StopRecording(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!gCapture.isRecording) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, "Not recording"));
    return result;
  }

  gCapture.isRecording = false;

  // Stop level timer
  StopLevelTimer();

  // Stop mic
  StopMic();

  // Flush remaining audio
  {
    std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
    gCapture.micBuffer.clear();
    gCapture.systemBuffer.clear();
  }

  // Flush final segment
  FlushSegment(true);

  // Stop system audio
  StopSystemAudio([]() {
    // Emit stopped status
    if (gCapture.tsfnStatus) {
      auto callback = [](Napi::Env env, Napi::Function fn) {
        auto obj = Napi::Object::New(env);
        obj.Set("state", Napi::String::New(env, "idle"));
        fn.Call({obj});
      };
      gCapture.tsfnStatus.NonBlockingCall(callback);
    }
  });

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  return result;
}

static Napi::Value CheckPermissions(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto result = Napi::Object::New(env);

  // Check mic permission
  AVAuthorizationStatus micStatus =
      [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
  bool micGranted = (micStatus == AVAuthorizationStatusAuthorized);
  result.Set("mic", Napi::Boolean::New(env, micGranted));

  // Screen permission can only be truly checked by attempting SCShareableContent
  // We return "unknown" until first attempt
  result.Set("screen", Napi::Boolean::New(env, false));

  return result;
}

static Napi::Value RequestMicPermission(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  auto deferred = Napi::Promise::Deferred::New(env);
  auto tsfn = Napi::ThreadSafeFunction::New(
      env, Napi::Function::New(env, [](const Napi::CallbackInfo &) {}),
      "mic_perm", 0, 1);

  auto *deferredPtr = new Napi::Promise::Deferred(deferred);
  auto tsfnCopy = tsfn;

  [AVCaptureDevice
      requestAccessForMediaType:AVMediaTypeAudio
              completionHandler:^(BOOL granted) {
                auto callback = [deferredPtr,
                                 granted](Napi::Env cbEnv, Napi::Function) {
                  deferredPtr->Resolve(Napi::Boolean::New(cbEnv, granted));
                  delete deferredPtr;
                };
                tsfnCopy.NonBlockingCall(callback);
                tsfnCopy.Release();
              }];

  return deferred.Promise();
}

static Napi::Value SetStatusCallback(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (gCapture.tsfnStatus) {
    gCapture.tsfnStatus.Release();
  }
  gCapture.tsfnStatus = Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "status_cb", 0, 1);
  return env.Undefined();
}

static Napi::Value SetLevelCallback(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (gCapture.tsfnLevel) {
    gCapture.tsfnLevel.Release();
  }
  gCapture.tsfnLevel = Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "level_cb", 0, 1);
  return env.Undefined();
}

static Napi::Value SetSegmentCallback(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (gCapture.tsfnSegment) {
    gCapture.tsfnSegment.Release();
  }
  gCapture.tsfnSegment = Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "segment_cb", 0, 1);
  return env.Undefined();
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startRecording",
              Napi::Function::New(env, StartRecording, "startRecording"));
  exports.Set("stopRecording",
              Napi::Function::New(env, StopRecording, "stopRecording"));
  exports.Set("checkPermissions",
              Napi::Function::New(env, CheckPermissions, "checkPermissions"));
  exports.Set(
      "requestMicPermission",
      Napi::Function::New(env, RequestMicPermission, "requestMicPermission"));
  exports.Set("setStatusCallback",
              Napi::Function::New(env, SetStatusCallback, "setStatusCallback"));
  exports.Set("setLevelCallback",
              Napi::Function::New(env, SetLevelCallback, "setLevelCallback"));
  exports.Set(
      "setSegmentCallback",
      Napi::Function::New(env, SetSegmentCallback, "setSegmentCallback"));
  return exports;
}

NODE_API_MODULE(scribe_audio, Init)
