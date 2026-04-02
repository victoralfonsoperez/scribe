{
  "targets": [
    {
      "target_name": "scribe_audio",
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS == 'mac'", {
          "sources": [
            "src/native/darwin/audio_capture.mm",
            "src/native/common/wav_writer.cpp"
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
        }],
        ["OS == 'win'", {
          "sources": [
            "src/native/win32/audio_capture.cpp",
            "src/native/common/wav_writer.cpp"
          ],
          "defines": [
            "WIN32_LEAN_AND_MEAN",
            "NOMINMAX",
            "UNICODE",
            "_UNICODE"
          ],
          "libraries": [
            "ole32.lib",
            "avrt.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }]
      ]
    }
  ]
}
