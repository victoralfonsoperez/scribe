// Windows WASAPI audio capture for Scribe
// Captures microphone (eCapture endpoint) and system audio (eRender loopback)
// Exposes the same N-API interface as the macOS implementation.

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <avrt.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <algorithm>

#include <napi.h>
#include "../common/wav_writer.h"

// IEEE float sub-format GUID: {00000003-0000-0010-8000-00AA00389B71}
static const GUID kSubFormatIEEEFloat = {
    0x00000003, 0x0000, 0x0010,
    {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}};

// PCM sub-format GUID: {00000001-0000-0010-8000-00AA00389B71}
static const GUID kSubFormatPCM = {
    0x00000001, 0x0000, 0x0010,
    {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}};

// ---------------------------------------------------------------------------
// Audio format helpers
// ---------------------------------------------------------------------------

static bool IsFloatFormat(WAVEFORMATEX *fmt) {
  if (fmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT)
    return true;
  if (fmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
    auto *ext = reinterpret_cast<WAVEFORMATEXTENSIBLE *>(fmt);
    return IsEqualGUID(ext->SubFormat, kSubFormatIEEEFloat) != 0;
  }
  return false;
}

static bool IsPCMFormat(WAVEFORMATEX *fmt) {
  if (fmt->wFormatTag == WAVE_FORMAT_PCM)
    return true;
  if (fmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
    auto *ext = reinterpret_cast<WAVEFORMATEXTENSIBLE *>(fmt);
    return IsEqualGUID(ext->SubFormat, kSubFormatPCM) != 0;
  }
  return false;
}

// Convert a WASAPI buffer to interleaved float32 samples in [-1, 1].
static void ConvertToFloat(const BYTE *src, WAVEFORMATEX *fmt,
                            UINT32 numFrames, std::vector<float> &out) {
  size_t numSamples = static_cast<size_t>(numFrames) * fmt->nChannels;
  out.resize(numSamples);

  if (IsFloatFormat(fmt) && fmt->wBitsPerSample == 32) {
    const float *f = reinterpret_cast<const float *>(src);
    std::copy(f, f + numSamples, out.begin());
  } else if (IsPCMFormat(fmt) && fmt->wBitsPerSample == 16) {
    const int16_t *s = reinterpret_cast<const int16_t *>(src);
    for (size_t i = 0; i < numSamples; i++) {
      out[i] = s[i] / 32768.0f;
    }
  } else if (IsPCMFormat(fmt) && fmt->wBitsPerSample == 24) {
    // 24-bit PCM packed as 3 bytes per sample (little-endian)
    for (size_t i = 0; i < numSamples; i++) {
      const BYTE *b = src + i * 3;
      int32_t v = static_cast<int32_t>(b[0]) |
                  (static_cast<int32_t>(b[1]) << 8) |
                  (static_cast<int32_t>(b[2]) << 16);
      if (v & 0x800000)
        v |= static_cast<int32_t>(0xFF000000); // sign-extend
      out[i] = v / 8388608.0f;
    }
  } else if (IsPCMFormat(fmt) && fmt->wBitsPerSample == 32) {
    const int32_t *s = reinterpret_cast<const int32_t *>(src);
    for (size_t i = 0; i < numSamples; i++) {
      out[i] = s[i] / 2147483648.0f;
    }
  } else {
    // Unsupported format — emit silence rather than crash
    std::fill(out.begin(), out.end(), 0.0f);
  }
}

// ---------------------------------------------------------------------------
// AudioCapture state
// ---------------------------------------------------------------------------

struct AudioCapture {
  // Config — derived from the default capture device mix format at start
  uint32_t sampleRate = 48000;
  uint16_t channels = 2;
  double segmentDurationSec = 30.0;
  std::string outputDir;

  // Buffers (protected by mutex)
  std::mutex bufferMutex;
  std::vector<float> micBuffer;
  std::vector<float> systemBuffer;
  std::vector<float> mixedBuffer;

  // WAV output
  WavWriter wavWriter;
  int segmentIndex = 0;
  size_t framesInSegment = 0;
  size_t segmentFrameLimit = 0;

  // Level metering
  float currentRMS = 0.0f;

  // Thread-safe callbacks
  Napi::ThreadSafeFunction tsfnStatus;
  Napi::ThreadSafeFunction tsfnLevel;
  Napi::ThreadSafeFunction tsfnSegment;

  // Capture threads
  std::atomic<bool> isRecording{false};
  std::thread micThread;
  std::thread systemThread;
  std::thread levelThread;
};

static AudioCapture gCapture;

// ---------------------------------------------------------------------------
// Helpers (parallel to the macOS implementation)
// ---------------------------------------------------------------------------

static std::string SegmentPath(const std::string &dir, int index) {
  char buf[512];
  snprintf(buf, sizeof(buf), "%s/segment_%04d.wav", dir.c_str(), index);
  return std::string(buf);
}

static float ComputeRMS(const float *data, size_t count) {
  if (count == 0)
    return 0.0f;
  double sum = 0.0;
  for (size_t i = 0; i < count; i++) {
    sum += static_cast<double>(data[i]) * data[i];
  }
  return static_cast<float>(std::sqrt(sum / count));
}

static void FlushSegment(bool isFinal) {
  auto &c = gCapture;
  if (!c.wavWriter.isOpen() || c.framesInSegment == 0)
    return;

  c.wavWriter.finalize();

  std::string path = SegmentPath(c.outputDir, c.segmentIndex);
  int idx = c.segmentIndex;

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

static void ProcessMixedAudio(const float *data, size_t frameCount) {
  auto &c = gCapture;
  if (!c.isRecording.load())
    return;

  if (c.wavWriter.isOpen()) {
    c.wavWriter.write(data, frameCount);
    c.framesInSegment += frameCount;

    if (c.framesInSegment >= c.segmentFrameLimit) {
      FlushSegment(false);
    }
  }

  size_t sampleCount = frameCount * c.channels;
  c.currentRMS = ComputeRMS(data, sampleCount);
}

static void MixAndProcess() {
  auto &c = gCapture;
  std::lock_guard<std::mutex> lock(c.bufferMutex);

  if (c.micBuffer.empty() && c.systemBuffer.empty())
    return;

  size_t micSamples = c.micBuffer.size();
  size_t sysSamples = c.systemBuffer.size();

  if (micSamples > 0 && sysSamples > 0) {
    size_t mixLen = std::min(micSamples, sysSamples);
    c.mixedBuffer.resize(mixLen);
    for (size_t i = 0; i < mixLen; i++) {
      c.mixedBuffer[i] = 0.5f * c.micBuffer[i] + 0.5f * c.systemBuffer[i];
    }
    c.micBuffer.erase(c.micBuffer.begin(),
                      c.micBuffer.begin() + static_cast<ptrdiff_t>(mixLen));
    c.systemBuffer.erase(c.systemBuffer.begin(),
                         c.systemBuffer.begin() + static_cast<ptrdiff_t>(mixLen));
    ProcessMixedAudio(c.mixedBuffer.data(), mixLen / c.channels);
  } else if (micSamples > 0) {
    ProcessMixedAudio(c.micBuffer.data(), micSamples / c.channels);
    c.micBuffer.clear();
  } else {
    ProcessMixedAudio(c.systemBuffer.data(), sysSamples / c.channels);
    c.systemBuffer.clear();
  }
}

// ---------------------------------------------------------------------------
// WASAPI capture thread (shared logic for mic and loopback)
//
// dataFlow:  eCapture for microphone, eRender for system audio loopback
// isLoopback: true adds AUDCLNT_STREAMFLAGS_LOOPBACK to Initialize flags
// ---------------------------------------------------------------------------

static void WasapiCaptureThread(EDataFlow dataFlow, bool isLoopback) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool shouldUninitCOM = SUCCEEDED(hr); // includes S_FALSE

  IMMDeviceEnumerator *enumerator = nullptr;
  IMMDevice *device = nullptr;
  IAudioClient *audioClient = nullptr;
  IAudioCaptureClient *captureClient = nullptr;
  WAVEFORMATEX *mixFmt = nullptr;
  HANDLE eventHandle = nullptr;
  HANDLE taskHandle = nullptr;

  auto cleanup = [&]() {
    if (captureClient) {
      captureClient->Release();
      captureClient = nullptr;
    }
    if (eventHandle) {
      CloseHandle(eventHandle);
      eventHandle = nullptr;
    }
    if (mixFmt) {
      CoTaskMemFree(mixFmt);
      mixFmt = nullptr;
    }
    if (audioClient) {
      audioClient->Release();
      audioClient = nullptr;
    }
    if (device) {
      device->Release();
      device = nullptr;
    }
    if (enumerator) {
      enumerator->Release();
      enumerator = nullptr;
    }
    if (taskHandle) {
      AvRevertMmThreadCharacteristics(taskHandle);
      taskHandle = nullptr;
    }
    if (shouldUninitCOM) {
      CoUninitialize();
    }
  };

  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                         __uuidof(IMMDeviceEnumerator),
                         reinterpret_cast<void **>(&enumerator));
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  hr = enumerator->GetDefaultAudioEndpoint(dataFlow, eConsole, &device);
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                         reinterpret_cast<void **>(&audioClient));
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  hr = audioClient->GetMixFormat(&mixFmt);
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  DWORD streamFlags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
  if (isLoopback)
    streamFlags |= AUDCLNT_STREAMFLAGS_LOOPBACK;

  // 200ms buffer
  REFERENCE_TIME bufferDuration = 2000000;

  hr = audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                bufferDuration, 0, mixFmt, nullptr);
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  eventHandle = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  if (!eventHandle) {
    cleanup();
    return;
  }

  hr = audioClient->SetEventHandle(eventHandle);
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  hr = audioClient->GetService(__uuidof(IAudioCaptureClient),
                                reinterpret_cast<void **>(&captureClient));
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  // Elevate thread priority for audio processing
  DWORD taskIndex = 0;
  taskHandle = AvSetMmThreadCharacteristicsW(L"Audio", &taskIndex);

  hr = audioClient->Start();
  if (FAILED(hr)) {
    cleanup();
    return;
  }

  std::vector<float> converted;

  while (gCapture.isRecording.load()) {
    DWORD waitResult = WaitForSingleObject(eventHandle, 200);
    if (waitResult != WAIT_OBJECT_0)
      continue;

    UINT32 packetSize = 0;
    while (SUCCEEDED(captureClient->GetNextPacketSize(&packetSize)) &&
           packetSize > 0) {
      BYTE *data = nullptr;
      UINT32 numFrames = 0;
      DWORD flags = 0;

      hr = captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
      if (FAILED(hr))
        break;

      if (numFrames > 0) {
        bool silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;

        if (silent) {
          // Push silence to maintain buffer alignment with the other stream
          size_t silentSamples =
              static_cast<size_t>(numFrames) * mixFmt->nChannels;
          converted.assign(silentSamples, 0.0f);
        } else {
          ConvertToFloat(data, mixFmt, numFrames, converted);
        }

        {
          std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
          auto &target =
              isLoopback ? gCapture.systemBuffer : gCapture.micBuffer;
          target.insert(target.end(), converted.begin(), converted.end());
        }
        MixAndProcess();
      }

      captureClient->ReleaseBuffer(numFrames);
    }
  }

  audioClient->Stop();
  cleanup();
}

// ---------------------------------------------------------------------------
// Level reporting thread (~10 Hz, same cadence as the macOS GCD timer)
// ---------------------------------------------------------------------------

static void LevelTimerThread() {
  while (gCapture.isRecording.load()) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    if (!gCapture.isRecording.load())
      break;

    float rms = gCapture.currentRMS;
    if (gCapture.tsfnLevel) {
      auto callback = [rms](Napi::Env env, Napi::Function fn) {
        auto obj = Napi::Object::New(env);
        obj.Set("rms", Napi::Number::New(env, rms));
        fn.Call({obj});
      };
      gCapture.tsfnLevel.NonBlockingCall(callback);
    }
  }
}

// ---------------------------------------------------------------------------
// Query default capture device mix format (called once at recording start)
// ---------------------------------------------------------------------------

static void QueryMicMixFormat(uint32_t &outSampleRate, uint16_t &outChannels) {
  outSampleRate = 48000;
  outChannels = 2;

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool shouldUninitCOM = SUCCEEDED(hr);

  IMMDeviceEnumerator *enumerator = nullptr;
  IMMDevice *device = nullptr;
  IAudioClient *audioClient = nullptr;
  WAVEFORMATEX *mixFmt = nullptr;

  if (SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
                                  CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                                  reinterpret_cast<void **>(&enumerator))) &&
      SUCCEEDED(enumerator->GetDefaultAudioEndpoint(eCapture, eConsole,
                                                     &device)) &&
      SUCCEEDED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                  reinterpret_cast<void **>(&audioClient))) &&
      SUCCEEDED(audioClient->GetMixFormat(&mixFmt))) {
    outSampleRate = mixFmt->nSamplesPerSec;
    outChannels = mixFmt->nChannels;
    CoTaskMemFree(mixFmt);
  }

  if (audioClient) audioClient->Release();
  if (device) device->Release();
  if (enumerator) enumerator->Release();
  if (shouldUninitCOM) CoUninitialize();
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

static Napi::Value StartRecording(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (gCapture.isRecording.load()) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, "Already recording"));
    return result;
  }

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
  gCapture.currentRMS = 0.0f;

  {
    std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
    gCapture.micBuffer.clear();
    gCapture.systemBuffer.clear();
    gCapture.mixedBuffer.clear();
  }

  // Derive WAV format from the default capture device mix format
  uint32_t sampleRate = 48000;
  uint16_t channels = 2;
  QueryMicMixFormat(sampleRate, channels);

  gCapture.sampleRate = sampleRate;
  gCapture.channels = channels;
  gCapture.segmentFrameLimit =
      static_cast<size_t>(sampleRate * gCapture.segmentDurationSec);
  gCapture.wavWriter.reconfigure(sampleRate, channels);

  // Open first WAV segment
  std::string firstPath = SegmentPath(gCapture.outputDir, 0);
  if (!gCapture.wavWriter.open(firstPath)) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error",
               Napi::String::New(env, "Failed to open WAV file: " + firstPath));
    return result;
  }

  gCapture.isRecording.store(true);

  gCapture.micThread = std::thread(WasapiCaptureThread, eCapture, false);
  gCapture.systemThread = std::thread(WasapiCaptureThread, eRender, true);
  gCapture.levelThread = std::thread(LevelTimerThread);

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

  if (!gCapture.isRecording.load()) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, "Not recording"));
    return result;
  }

  // Signal threads to stop
  gCapture.isRecording.store(false);

  // Wait for all capture threads to finish
  if (gCapture.micThread.joinable())
    gCapture.micThread.join();
  if (gCapture.systemThread.joinable())
    gCapture.systemThread.join();
  if (gCapture.levelThread.joinable())
    gCapture.levelThread.join();

  // Discard any remaining unprocessed audio
  {
    std::lock_guard<std::mutex> lock(gCapture.bufferMutex);
    gCapture.micBuffer.clear();
    gCapture.systemBuffer.clear();
  }

  // Finalize the last WAV segment
  FlushSegment(true);

  if (gCapture.tsfnStatus) {
    auto callback = [](Napi::Env env, Napi::Function fn) {
      auto obj = Napi::Object::New(env);
      obj.Set("state", Napi::String::New(env, "idle"));
      fn.Call({obj});
    };
    gCapture.tsfnStatus.NonBlockingCall(callback);
  }

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  return result;
}

static Napi::Value CheckPermissions(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto result = Napi::Object::New(env);
  // Win32 apps have no runtime permission dialog; access is controlled by
  // Windows Privacy Settings. Return true and let WASAPI report errors at
  // capture time if the user has blocked access.
  result.Set("mic", Napi::Boolean::New(env, true));
  result.Set("screen", Napi::Boolean::New(env, true));
  return result;
}

static Napi::Value RequestMicPermission(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  // No runtime permission prompt available for Win32 apps — resolve immediately.
  auto deferred = Napi::Promise::Deferred::New(env);
  deferred.Resolve(Napi::Boolean::New(env, true));
  return deferred.Promise();
}

static Napi::Value SetStatusCallback(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (gCapture.tsfnStatus)
    gCapture.tsfnStatus.Release();
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
  if (gCapture.tsfnLevel)
    gCapture.tsfnLevel.Release();
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
  if (gCapture.tsfnSegment)
    gCapture.tsfnSegment.Release();
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
