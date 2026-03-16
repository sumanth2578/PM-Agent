// Function to transcribe audio using the Hugging Face model
/**
 * Transcribe audio using a backend endpoint that runs facebook/s2t-small-librispeech-asr.
 * @param audioBlob
 * @returns
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');

  const response = await fetch('https://speech2text-6n0t.onrender.com/api/speech2text', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to transcribe audio');
  }

  const data = await response.json();
  return data.transcription;
}