import { isValidSpotifyUrl, extractSpotifyTrackId } from '../services/spotify';

describe('Spotify Integration Unit Tests', () => {
  describe('isValidSpotifyUrl', () => {
    it('accepts standard web open.spotify.com track URLs', () => {
      expect(isValidSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
      expect(isValidSpotifyUrl('http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc12345')).toBe(true);
    });

    it('accepts spotify URI scheme', () => {
      expect(isValidSpotifyUrl('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
    });

    it('rejects invalid or non-Spotify URLs', () => {
      expect(isValidSpotifyUrl('https://youtube.com/watch?v=123')).toBe(false);
      expect(isValidSpotifyUrl('https://soundcloud.com/track')).toBe(false);
      expect(isValidSpotifyUrl('random string')).toBe(false);
      expect(isValidSpotifyUrl('')).toBe(false);
    });
  });

  describe('extractSpotifyTrackId', () => {
    it('extracts 22-char track ID from Spotify URLs and URIs', () => {
      expect(extractSpotifyTrackId('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe('4cOdK2wGLETKBW3PvgPWqT');
      expect(extractSpotifyTrackId('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe('4cOdK2wGLETKBW3PvgPWqT');
      expect(extractSpotifyTrackId('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abcdef123456')).toBe('4cOdK2wGLETKBW3PvgPWqT');
    });

    it('returns null for non-Spotify URLs', () => {
      expect(extractSpotifyTrackId('https://youtube.com')).toBeNull();
    });
  });
});
