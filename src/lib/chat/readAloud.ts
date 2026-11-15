export function supportsReadAloud(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function readAloud(text: string, reportError: (notice: string) => void): void {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const voice =
    voices.find((item) => item.lang === 'en-US' && /Samantha|Aria|Google US English/i.test(item.name)) ??
    voices.find((item) => item.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1.03;
  utterance.onerror = (event) => {
    if (!['interrupted', 'canceled'].includes(event.error)) {
      reportError('Voice couldn’t start. You can keep chatting here.');
    }
  };
  try {
    speechSynthesis.speak(utterance);
  } catch {
    reportError('Voice isn’t available right now. You can keep chatting here.');
  }
}
