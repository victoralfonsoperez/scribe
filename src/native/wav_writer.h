#pragma once

#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

class WavWriter {
public:
  WavWriter(uint32_t sampleRate = 48000, uint16_t channels = 2);
  ~WavWriter();

  bool open(const std::string &path);
  bool write(const float *data, size_t frameCount);
  bool finalize();
  bool isOpen() const;
  size_t framesWritten() const;

private:
  void writeHeader();

  std::ofstream file_;
  std::string path_;
  uint32_t sampleRate_;
  uint16_t channels_;
  uint32_t dataSize_;
  bool isOpen_;
};
