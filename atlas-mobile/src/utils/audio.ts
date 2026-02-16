import { Paths, File } from 'expo-file-system';

/**
 * Decode a base64 string to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Write base64-encoded WAV to a temp file and return the URI.
 */
export function writeBase64WavToFile(base64: string): string {
  const filename = `atlas_response_${Date.now()}.wav`;
  const file = new File(Paths.cache, filename);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}
