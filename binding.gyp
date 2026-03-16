{
  "targets": [
    {
      "target_name": "scribe_audio",
      "sources": [
        "src/native/audio_capture.mm",
        "src/native/wav_writer.mm"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "OTHER_CFLAGS": ["-fobjc-arc"],
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
      },
      "link_settings": {
        "libraries": [
          "-framework CoreAudio",
          "-framework AudioToolbox",
          "-framework ScreenCaptureKit",
          "-framework AVFoundation",
          "-framework CoreMedia",
          "-framework Foundation"
        ]
      }
    }
  ]
}
