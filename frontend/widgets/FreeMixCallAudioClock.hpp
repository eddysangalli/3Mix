// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <cstdint>
#include <limits>

namespace freemix_call_audio {
// Externally serialized as decimal strings: no JSON Number precision loss, no wrap to a previous owner.
struct Epoch {
 uint64_t value = 1;
 bool exhausted = false;
 bool Advance() {
  if (exhausted || value == std::numeric_limits<uint64_t>::max()) { exhausted = true; return false; }
  ++value; return true;
 }
};
struct CaptureIdentity {
 uint64_t generation, privacy;
 bool Matches(const Epoch &g, const Epoch &p, uint64_t tapGeneration) const {
  return !g.exhausted && !p.exhausted && generation == g.value && privacy == p.value && tapGeneration == generation;
 }
};
struct Clock {
 uint64_t epoch = 0, lastRaw = 0, lastAligned = 0;
 int64_t offset = 0;
 uint32_t lastAnchorReason = 0;
 bool started = false, exhausted = false;
 // reason: 0 continuous, 1 first anchor, 2 raw backwards, 3 future, 4 past, 5 arithmetic overflow.
 bool Align(uint64_t raw, uint64_t now, uint32_t frames, uint32_t rate, uint64_t &timestamp, uint32_t &reason) {
  constexpr uint64_t max = uint64_t(std::numeric_limits<int64_t>::max());
  if (exhausted || raw > max || now > max || frames == 0 || frames > 8192 || rate < 8000 || rate > 192000) return false;
  const uint64_t duration = uint64_t(frames) * 1000000000ULL / rate;
  const int64_t target = int64_t(now > duration ? now - duration : 0);
  const bool overflow = offset > 0 && raw > max - uint64_t(offset);
  const int64_t aligned = overflow ? 0 : int64_t(raw) + offset; // negative offset cannot underflow int64 for raw >= 0
  reason = !started ? 1 : raw < lastRaw ? 2 : overflow ? 5 :
   aligned < 0 ? 4 : uint64_t(aligned) > now && uint64_t(aligned) - now > 100000000ULL ? 3 :
   now > uint64_t(aligned) && now - uint64_t(aligned) > 750000000ULL ? 4 : 0;
  if (reason) {
   if (epoch == std::numeric_limits<uint64_t>::max()) { exhausted = true; return false; }
   ++epoch; offset = target - int64_t(raw); started = true; lastAnchorReason = reason;
   timestamp = uint64_t(target);
  } else timestamp = uint64_t(aligned > 0 ? aligned : 0);
  lastRaw = raw; lastAligned = timestamp; return true;
 }
};
}
