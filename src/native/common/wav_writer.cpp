#include "wav_writer.h"
#include <algorithm>

WavWriter::WavWriter(uint32_t sampleRate, uint16_t channels)
    : sampleRate_(sampleRate), channels_(channels), dataSize_(0),
      isOpen_(false) {}

WavWriter::~WavWriter() {
  if (isOpen_) {
    finalize();
  }
}

void WavWriter::reconfigure(uint32_t sampleRate, uint16_t channels) {
  if (!isOpen_) {
    sampleRate_ = sampleRate;
    channels_ = channels;
  }
}

bool WavWriter::open(const std::string &path) {
  if (isOpen_) {
    finalize();
  }

  path_ = path;
  file_.open(path, std::ios::binary | std::ios::trunc);
  if (!file_.is_open()) {
    return false;
  }

  isOpen_ = true;
  dataSize_ = 0;
  writeHeader();
  return true;
}

void WavWriter::writeHeader() {
  // RIFF header
  file_.write("RIFF", 4);
  uint32_t placeholder = 0;
  file_.write(reinterpret_cast<const char *>(&placeholder), 4); // file size - 8
  file_.write("WAVE", 4);

  // fmt subchunk
  file_.write("fmt ", 4);
  uint32_t fmtSize = 16;
  file_.write(reinterpret_cast<const char *>(&fmtSize), 4);
  uint16_t audioFormat = 1; // PCM
  file_.write(reinterpret_cast<const char *>(&audioFormat), 2);
  file_.write(reinterpret_cast<const char *>(&channels_), 2);
  file_.write(reinterpret_cast<const char *>(&sampleRate_), 4);
  uint16_t bitsPerSample = 16;
  uint32_t byteRate = sampleRate_ * channels_ * (bitsPerSample / 8);
  file_.write(reinterpret_cast<const char *>(&byteRate), 4);
  uint16_t blockAlign = channels_ * (bitsPerSample / 8);
  file_.write(reinterpret_cast<const char *>(&blockAlign), 2);
  file_.write(reinterpret_cast<const char *>(&bitsPerSample), 2);

  // data subchunk
  file_.write("data", 4);
  file_.write(reinterpret_cast<const char *>(&placeholder), 4); // data size
}

bool WavWriter::write(const float *data, size_t frameCount) {
  if (!isOpen_) {
    return false;
  }

  size_t sampleCount = frameCount * channels_;
  std::vector<int16_t> buffer(sampleCount);

  for (size_t i = 0; i < sampleCount; i++) {
    float sample = std::max(-1.0f, std::min(1.0f, data[i]));
    buffer[i] = static_cast<int16_t>(sample * 32767.0f);
  }

  file_.write(reinterpret_cast<const char *>(buffer.data()),
              sampleCount * sizeof(int16_t));
  dataSize_ += static_cast<uint32_t>(sampleCount * sizeof(int16_t));
  return file_.good();
}

bool WavWriter::finalize() {
  if (!isOpen_) {
    return false;
  }

  // Patch RIFF size (file size - 8)
  uint32_t riffSize = 36 + dataSize_;
  file_.seekp(4);
  file_.write(reinterpret_cast<const char *>(&riffSize), 4);

  // Patch data chunk size
  file_.seekp(40);
  file_.write(reinterpret_cast<const char *>(&dataSize_), 4);

  file_.close();
  isOpen_ = false;
  return true;
}

bool WavWriter::isOpen() const { return isOpen_; }

size_t WavWriter::framesWritten() const {
  if (channels_ == 0)
    return 0;
  return dataSize_ / (channels_ * sizeof(int16_t));
}
