import { isValidYouTubeUrl, extractVideoId } from '../services/youtube';

describe('YouTube Integration Unit Tests', () => {
  describe('isValidYouTubeUrl', () => {
    it('accepts standard desktop watch URLs', () => {
      expect(isValidYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isValidYouTubeUrl('http://youtube.com/watch?v=dQw4w9WgXcQ&t=40s')).toBe(true);
    });

    it('accepts short youtu.be URLs', () => {
      expect(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(isValidYouTubeUrl('http://youtu.be/dQw4w9WgXcQ?si=abc12345')).toBe(true);
    });

    it('accepts YouTube Music URLs', () => {
      expect(isValidYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('accepts YouTube Shorts and Embed URLs', () => {
      expect(isValidYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
      expect(isValidYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
    });

    it('rejects invalid or non-YouTube URLs', () => {
      expect(isValidYouTubeUrl('https://soundcloud.com/artist/track')).toBe(false);
      expect(isValidYouTubeUrl('https://spotify.com/track/123')).toBe(false);
      expect(isValidYouTubeUrl('random string')).toBe(false);
      expect(isValidYouTubeUrl('')).toBe(false);
    });
  });

  describe('extractVideoId', () => {
    it('extracts 11-char video ID from various YouTube URLs', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');
      expect(extractVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('returns null for non-YouTube URLs', () => {
      expect(extractVideoId('https://google.com')).toBeNull();
    });
  });
});
