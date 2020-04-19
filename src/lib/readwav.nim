import streams

type WavFile* = object
  data*: string
  freq*: int
  channels*: int

proc readWav*(path: string): WavFile =
  let
    f = path.open().newFileStream()
    chunkID = f.readStr(4) # RIFF
    chunkSize = f.readUint32()
    format = f.readStr(4)  # WAVE
    subchunk1ID = f.readStr(4) # fmt
    subchunk1Size = f.readUint32()
    audioFormat = f.readUint16() # 1
    numChannels = f.readUint16()
    sampleRate = f.readUint32()
    byteRate = f.readUint32()
    blockAlign = f.readUint16()
    bitsPerSample2 = f.readUint16()
    subchunk2ID = f.readStr(4)
    subchunk2Size = f.readUint32()
    data = f.readStr(subchunk2Size.int)
  # assert chunkID == "RIFF"
  # assert format == "WAVE"
  # assert subchunk1ID == "fmt "
  # assert audioFormat == 1
  # assert subchunk2ID == "data"
  result.channels = numChannels.int
  result.freq = sampleRate.int
  result.data = data
